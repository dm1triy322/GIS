from flask import Flask, render_template, request, jsonify, send_from_directory
from pypdf import PdfReader
from pdf2image import convert_from_path
from flask import make_response

import os
import re  
import pyproj
import pymysql
import json
import hashlib
import uuid
import shutil
from pyproj import Transformer

app = Flask(__name__, static_folder="static", template_folder="templates")

UPLOAD_FOLDER = os.path.join(app.static_folder, 'buildings')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)    
#PDF_FOLDER = r"C:\Users\user\Desktop\БЗ\TZ"
#JSON_FILE = "shapes.json"
#POPPLER_PATH = r"C:\Users\user\Desktop\БЗ\TZ\venv\Lib\site-packages\poppler-24.08.0\Library\bin"
#PNG_PAGES_FOLDER = r"C:\Users\user\Desktop\БЗ\TZ\корп 42_pages"

PDF_FOLDER = r"C:\Users\dmitriy.beglov\Desktop\БЗ\TZ"
JSON_FILE = "shapes.json"  
POPPLER_PATH = r"C:\Users\dmitriy.beglov\Desktop\БЗ\TZ\venv\Lib\site-packages\poppler-24.08.0\Library\bin"
PNG_PAGES_FOLDER = r"C:\Users\dmitriy.beglov\Desktop\БЗ\TZ\корп 42_pages"

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "Bds2121795!7559",
    "database": "shapes_db"
}

@app.route("/png_pages/<path:filename>")
def serve_png_page(filename):
    return send_from_directory(PNG_PAGES_FOLDER, filename)

@app.route("/get_building_pages/<building_name>")
def get_building_pages(building_name):
    folder_path = os.path.join(PDF_FOLDER, f"{building_name}_pages")
    if not os.path.exists(folder_path):
        return jsonify({"error": "Папка не найдена"}), 404

    pngs = [
        f"/png_pages/{file}"
        for file in sorted(os.listdir(folder_path))
        if file.endswith(".png")
    ]
    return jsonify({"pages": pngs})

@app.route("/get_pages_list", methods=["GET"])
def get_pages_list():
    pages_dir = os.path.join(PDF_FOLDER, "корп 42_pages")
    if not os.path.exists(pages_dir):
        return jsonify({"pages": []})
    
    pngs = [f for f in os.listdir(pages_dir) if f.endswith(".png")]
    return jsonify({"pages": pngs})



@app.route("/save_building", methods=["POST"])
def save_building():
    data = request.get_json()
    building_name = data.get("name")
    selected_files = data.get("files", [])

    building_path = os.path.join(UPLOAD_FOLDER, building_name)
    os.makedirs(building_path, exist_ok=True)

    for file in selected_files:
        src = os.path.join(app.static_folder, 'pages', file)
        dst = os.path.join(building_path, file)
        if os.path.exists(src):
            shutil.copy(src, dst)

    return jsonify({"message": f"{building_name} сохранено", "path": f"/static/buildings/{building_name}"})


@app.route("/list_buildings", methods=["GET"])
def list_buildings():
    buildings = []
    for name in os.listdir(UPLOAD_FOLDER):
        b_path = os.path.join(UPLOAD_FOLDER, name)
        if os.path.isdir(b_path):
            images = [f"/static/buildings/{name}/{img}" for img in os.listdir(b_path) if img.endswith(".png")]
            buildings.append({"name": name, "images": images})
    return jsonify(buildings)
def get_db_connection():
    return pymysql.connect(**DB_CONFIG, cursorclass=pymysql.cursors.DictCursor)


def import_json_to_mysql():
    try:
        with open("shapes.json", "r", encoding="utf-8") as file:
            data = json.load(file)

        if not data.get("shapes"):
            print("JSON-файл пустой, ничего не загружаем.")
            return

        connection = get_db_connection()
        cursor = connection.cursor()

        inserted_count = 0

        for shape in data["shapes"]:

            shape_type = shape.get("type", "polygon")
            uuid_value = shape.get("uuid", str(uuid.uuid4()))
            coordinates = json.dumps(shape.get("coords", shape))

            coord_hash = hashlib.sha256(coordinates.encode()).hexdigest()

            cursor.execute("SELECT COUNT(*) FROM shapes WHERE coord_hash = %s", (coord_hash,))
            exists = cursor.fetchone()["COUNT(*)"]

            if exists == 0:
                cursor.execute(
                    "INSERT INTO shapes (uuid, shape_type, coordinates, coord_hash) VALUES (%s, %s, %s, %s)",
                    (uuid_value, shape_type, coordinates, coord_hash)
                )
                inserted_count += 1

        connection.commit()
        cursor.close()
        connection.close()

        print(f"Загружено новых фигур в MySQL: {inserted_count}")

    except Exception as e:
        print(f"Ошибка загрузки в MySQL: {e}")

@app.route("/import_shapes", methods=["GET"])
def import_shapes():
    import_json_to_mysql()
    return jsonify({"message": "Данные загружены в MySQL!"})

import_json_to_mysql()  

def print_shapes_from_db():
    conn = get_db_connection()
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM shapes")
        shapes = cursor.fetchall()
    
    conn.close()

    print("\nТаблица MySQL: shapes (Все фигуры)\n" + "="*50)
    if not shapes:
        print("Таблица пустая!")
        return

    for row in shapes:
        print(f"ID: {row['id']}")
        print(f"Тип: {row['shape_type']}")
        print(f"Координаты: {row['coordinates']}")
        print(f"Дата создания: {row['created_at']}")
        print("-" * 50)

@app.route("/create_building", methods=["POST"])
def create_building():
    data = request.json
    name = data.get("name")
    floors = data.get("floors")  

    if not name or not floors:
        return jsonify({"error": "Имя и этажи обязательны"}), 400

    new_building = {
        "uuid": str(uuid.uuid4()),
        "name": name,
        "floors": {str(f): {"coords": [], "confirmed": False} for f in floors}
    }

    buildings = []
    if os.path.exists("buildings.json"):
        with open("buildings.json", "r", encoding="utf-8") as f:
            buildings = json.load(f).get("buildings", [])

    buildings.append(new_building)

    with open("buildings.json", "w", encoding="utf-8") as f:
        json.dump({"buildings": buildings}, f, indent=4, ensure_ascii=False)

    return jsonify({"message": "Здание создано", "uuid": new_building["uuid"]})

# Функция логирования координат
def print_coords_step(step, coords):
    print(f"\n{step}:")
    for i, (x, y) in enumerate(coords):
        print(f"{i + 1}: X={x}, Y={y}")

# Функция конвертации координат (НЕ меняем lat, lon!)
def convert_coords(coords, source_crs, target_crs):
    transformer = Transformer.from_proj(source_crs, target_crs, always_xy=True)
    converted_coords = []
    
    for x, y in coords:
        lat, lon = transformer.transform(y, x)  
        converted_coords.append([lon, lat])  
    
    print_coords_step("Конвертированные координаты", converted_coords)  
    return converted_coords
	# Функция извлечения координат из 8 и 9 страниц PDF
def extract_coords(fname):
    print('extracting from', fname)
    reader = PdfReader(fname)
    print(len(reader.pages))

    rez_podz = open(fname[:-4] + '_Подземный.txt', 'w')
    rez_naz = open(fname[:-4] + '_Наземный.txt', 'w')
    rez_nadz = open(fname[:-4] + '_Надземный.txt', 'w')

    coords_yes = False
    for page in reader.pages:
        pt = page.extract_text()
        ind = find_start_index(pt)
        if ind != 0:
            coords_yes = True
            extract_coordinates(pt, rez_podz, rez_naz, rez_nadz)
        elif coords_yes:
            break

    rez_podz.close()
    rez_naz.close()
    rez_nadz.close()
    print('extracting complete')


#Эта функция должна быть вне 'extract_coords'
def save_pdf_pages_as_png(pdf_path):
    print(f"Конвертируем страницы {pdf_path} в PNG...")

    filename_no_ext = os.path.splitext(os.path.basename(pdf_path))[0]
    output_dir = os.path.join(PDF_FOLDER, f"{filename_no_ext}_pages")

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    try:
        images = convert_from_path(
            pdf_path,
            dpi=300,
            poppler_path=r"C:\Users\dmitriy.beglov\Desktop\БЗ\TZ\venv\Lib\site-packages\poppler-24.08.0\Library\bin"  
        )
        for i, image in enumerate(images):
            img_path = os.path.join(output_dir, f"page_{i + 1}.png")
            image.save(img_path, "PNG")
            print(f"Сохранено: {img_path}")
    except Exception as e:
        print(f"Ошибка при конвертации PDF в PNG: {e}")




def find_start_index(pt):
    ind1 = pt.find('Внешний контур')
    if ind1 != -1:
        return ind1 + 15
    ind2 = pt.find('1.1. Сведения о характерных точках контура объекта недвижимости')
    if ind2 != -1:
        return ind2 + 63
    return 0


def extract_coordinates(pt, rez_podz, rez_naz, rez_nadz):
    while any(keyword in pt for keyword in ['Подземный', 'Наземный', 'Надземный']):
        x, y, pt = extract_xy(pt)
        if 'Подземный' in pt:
            rez_podz.write(f"{x}, {y}\n")
        elif 'Наземный' in pt:
            rez_naz.write(f"{x}, {y}\n")
        elif 'Надземный' in pt:
            rez_nadz.write(f"{x}, {y}\n")


def extract_xy(pt):
    x_ind = find_first_index(pt, ['580', '581', '579', '578', '577'])
    y_ind = find_first_index(pt, ['217', '218', '216'])
    x = pt[x_ind: x_ind + 9].replace(' ','')
    y = pt[y_ind: y_ind + 10].replace(' ','')
    pt = pt[max(x_ind + 9, y_ind + 10, pt.index('\n')):]
    return x, y, pt


def find_first_index(pt, options):
    for option in options:
        if option in pt:
            return pt.index(option)
    return -1



#Функция загрузки сохранённых фигур из JSON
def load_shapes_from_json():
    if not os.path.exists(JSON_FILE):
        print("⚠ Файл shapes.json не найден. Загружаем пустые данные.")
        return {"shapes": []}
    
    try:
        with open(JSON_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            print(f"Загружены фигуры из {JSON_FILE}: {len(data.get('shapes', []))} шт.")
            return data
    except Exception as e:
        print(f"Ошибка при загрузке JSON: {e}")
        return {"shapes": []}

#Загрузка фигур из JSON
@app.route("/load_shapes", methods=["GET"])
def load_shapes():
    try:
        with open(JSON_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
            print(f"Загружены фигуры: {len(data.get('shapes', []))} шт.")
            return jsonify(data)
    except (FileNotFoundError, json.JSONDecodeError):
        print("Файл shapes.json отсутствует или повреждён. Возвращаем пустой массив.")
        return jsonify({"shapes": []})



#Сохранение фигур в JSON (перезапись)
@app.route("/save_shapes", methods=["POST"])
def save_shapes():
    try:
        data = request.get_json()
        shapes = data.get("shapes", [])

        for shape in shapes:
            if "uuid" not in shape:
                shape["uuid"] = str(uuid.uuid4())

        with open(JSON_FILE, "w", encoding="utf-8") as file:
            json.dump({"shapes": shapes}, file, indent=4, ensure_ascii=False)

        print(f"Фигуры сохранены в shapes.json: {len(shapes)} шт.")
        return jsonify({"message": "Фигуры успешно сохранены", "count": len(shapes)})
    except Exception as e:
        print(f"Ошибка сохранения фигур: {e}")
        return jsonify({"error": "Ошибка при сохранении фигур"}), 500


# API для получения списка PDF
@app.route("/list_pdfs", methods=["GET"])
def list_pdfs():
    pdf_files = [f for f in os.listdir(PDF_FOLDER) if f.endswith(".pdf")]
    return jsonify({"pdfs": pdf_files})

def save_pdf_pages_as_png(pdf_path, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    images = convert_from_path(pdf_path, poppler_path=POPPLER_PATH)
    for i, image in enumerate(images):
        image.save(os.path.join(output_dir, f"page_{i + 1}.png"), "PNG")

@app.route("/load_pdf", methods=["POST"])
def load_pdf():
    data = request.get_json()
    filename = data.get("filename")
    floors = data.get("floors", [])

    if not filename:
        return jsonify({"error": "Не передано имя PDF-файла"}), 400

    pdf_path = os.path.join(PDF_FOLDER, filename)
    if not os.path.exists(pdf_path):
        return jsonify({"error": "PDF не найден"}), 404

    png_output_dir = os.path.join(PDF_FOLDER, f"{os.path.splitext(filename)[0]}_pages")
    save_pdf_pages_as_png(pdf_path, png_output_dir)

    return jsonify({
        "message": f"{filename} загружен и конвертирован",
        "pages_dir": png_output_dir
    })
    
@app.route("/get_floor_images", methods=["GET"])
def get_floor_images():
    floor = request.args.get('floor', '0')
    print(f"Запрос изображений для этажа: {floor}")
    
    if not os.path.exists(PNG_PAGES_FOLDER):
        print(f"Ошибка: директория {PNG_PAGES_FOLDER} не найдена")
        return jsonify({"error": "Директория не найдена", "images": []})
    
    try:
        all_images = sorted([f for f in os.listdir(PNG_PAGES_FOLDER) if f.endswith('.png')])
        print(f"Найдено изображений: {all_images}")
        
        images_list = [f"/get_png_image?file={img}" for img in all_images]
        return jsonify({"images": images_list, "floor": floor, "status": "success"})
        
    except Exception as e:
        print(f"Ошибка: {str(e)}")
        return jsonify({"error": str(e), "status": "error"}), 500

@app.route('/get_png_image', methods=['GET'])
def get_png_image():
    filename = request.args.get('file')
    if not filename:
        return jsonify({"error": "Не указано имя файла"}), 400
    
    try:
        if '..' in filename or filename.startswith('/'):
            return jsonify({"error": "Недопустимое имя файла"}), 400
            
        image_path = os.path.join(PNG_PAGES_FOLDER, filename)
        
        if not os.path.exists(image_path):
            return jsonify({"error": "Файл не найден"}), 404
            
        return send_from_directory(PNG_PAGES_FOLDER, filename, mimetype='image/png')
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/get_floors_list")
def get_floors_list():
    try:
        with open("floors.json", "r", encoding="utf-8") as f:
            floors = json.load(f)
        return jsonify(floors)
    except Exception as e:
        return jsonify([])
@app.route("/add_floor", methods=["POST"])
@app.route("/add_floor", methods=["POST"])
def add_floor():
    data = request.get_json()
    new_floor = {
        "id": int(data.get("id")),
        "name": data.get("name")
    }

    path = "floors.json"
    floors = []

    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            try:
                floors = json.load(f)
            except:
                floors = []

    floors.append(new_floor)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(floors, f, indent=2, ensure_ascii=False)

    print(f"Добавлен этаж: {new_floor}")
    return jsonify({"success": True, "message": "Этаж добавлен"})




# 2. Получение списка PNG файлов
@app.route('/get_png_list', methods=['GET'])
def get_png_list():
    png_dir = r"C:\Users\dmitriy.beglov\Desktop\БЗ\TZ\корп 42_pages"
    if os.path.exists(png_dir):
        png_files = [f for f in os.listdir(png_dir) if f.lower().endswith('.png')]
        return jsonify(png_files)
    return jsonify([])

# 3. Получение изображения для этажа
@app.route('/get_floor_image', methods=['GET'])
def get_floor_image():
    floor_id = str(request.args.get('floor_id'))
    mapping_file = "floor_png_map.json"

    if not os.path.exists(mapping_file):
        return jsonify({"image": None})

    with open(mapping_file, "r", encoding="utf-8") as f:
        mappings = json.load(f)

    png_name = mappings.get(floor_id)
    return jsonify({"image": png_name}) if png_name else jsonify({"image": None})


# 4. Сохранение PNG для этажа
@app.route('/save_floor_png', methods=['POST'])
def save_floor_png():
    data = request.get_json()
    floor_id = data.get('floor_id')
    png_file = data.get('png_file')
    

    
    return jsonify({"success": True, "message": "PNG сохранен для этажа"})

@app.route("/get_available_pngs", methods=["GET"])
def get_available_pngs():
    png_dir = r"C:\Users\dmitriy.beglov\Desktop\БЗ\TZ\корп 42_pages"
    if os.path.exists(png_dir):
        pngs = [f for f in os.listdir(png_dir) if f.lower().endswith('.png')]
        return jsonify({"pngs": pngs})
    return jsonify({"pngs": []})

@app.route("/attach_png_to_floor", methods=["POST"])
def attach_png_to_floor():
    data = request.get_json()
    floor_id = str(data.get("floor_id"))
    png_name = data.get("png_name")

    mapping_file = "floor_png_map.json"
    mappings = {}

    if os.path.exists(mapping_file):
        with open(mapping_file, "r", encoding="utf-8") as f:
            mappings = json.load(f)

    mappings[floor_id] = png_name

    with open(mapping_file, "w", encoding="utf-8") as f:
        json.dump(mappings, f, indent=2, ensure_ascii=False)

    return jsonify({"success": True, "message": f"Изображение {png_name} прикреплено к этажу {floor_id}"})

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

if __name__ == "__main__":
    app.run(debug=True)

print_shapes_from_db() 