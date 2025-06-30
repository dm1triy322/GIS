from flask import Flask, render_template, request, jsonify, send_from_directory
from pypdf import PdfReader
import os
import re  
import pyproj
import pymysql
import json
import hashlib
from pyproj import Transformer

app = Flask(__name__, static_folder="static", template_folder="templates")

PDF_FOLDER = r"C:\Users\user\Desktop\БЗ\TZ"
JSON_FILE = "shapes.json"  # 📌 Файл для сохранения фигур


DB_CONFIG = {
    "host": "localhost",
    "user": "root",  # 🔴 Замени на свой логин
    "password": "Bds2121795!7559",  # 🔴 Замени на свой пароль
    "database": "shapes_db"
}

def get_db_connection():
    return pymysql.connect(**DB_CONFIG, cursorclass=pymysql.cursors.DictCursor)


def import_json_to_mysql():
    try:
        with open("shapes.json", "r", encoding="utf-8") as file:
            data = json.load(file)

        if not data.get("shapes"):
            print("⚠ JSON-файл пустой, ничего не загружаем.")
            return

        connection = get_db_connection()
        cursor = connection.cursor()

        inserted_count = 0

        for shape in data["shapes"]:
            shape_type = shape["type"]
            coordinates = json.dumps(shape["coords"]) if "coords" in shape else json.dumps(shape)
            
            # 🔹 Создаем SHA256-хэш координат
            coord_hash = hashlib.sha256(coordinates.encode()).hexdigest()

            # 🔹 Проверяем, есть ли уже такой объект в БД
            cursor.execute("SELECT COUNT(*) FROM shapes WHERE coord_hash = %s", (coord_hash,))
            exists = cursor.fetchone()["COUNT(*)"]

            if exists == 0:
                # 🔹 Добавляем новую фигуру в MySQL
                cursor.execute("INSERT INTO shapes (shape_type, coordinates) VALUES (%s, %s)", (shape_type, coordinates))
                               
                inserted_count += 1

        connection.commit()
        cursor.close()
        connection.close()

        print(f"✅ Загружено новых фигур в MySQL: {inserted_count}")

    except Exception as e:
        print(f"❌ Ошибка загрузки в MySQL: {e}")

@app.route("/import_shapes", methods=["GET"])
def import_shapes():
    import_json_to_mysql()
    return jsonify({"message": "Данные загружены в MySQL!"})

import_json_to_mysql()  # ✅ Авто-загрузка данных в MySQL при сохранении

def print_shapes_from_db():
    conn = get_db_connection()
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM shapes")
        shapes = cursor.fetchall()
    
    conn.close()

    print("\n📌 Таблица MySQL: shapes (Все фигуры)\n" + "="*50)
    if not shapes:
        print("⚠ Таблица пустая!")
        return

    for row in shapes:
        print(f"🆔 ID: {row['id']}")
        print(f"📂 Тип: {row['shape_type']}")
        print(f"📍 Координаты: {row['coordinates']}")
        print(f"🕒 Дата создания: {row['created_at']}")
        print("-" * 50)


# 📌 Функция логирования координат
def print_coords_step(step, coords):
    print(f"\n🔄 {step}:")
    for i, (x, y) in enumerate(coords):
        print(f"📍 {i + 1}: X={x}, Y={y}")

# 📌 Функция конвертации координат (НЕ меняем lat, lon!)
def convert_coords(coords, source_crs, target_crs):
    transformer = Transformer.from_proj(source_crs, target_crs, always_xy=True)
    converted_coords = []
    
    for x, y in coords:
        lat, lon = transformer.transform(y, x)  # ✅ Вернули как было!
        converted_coords.append([lon, lat])  # ✅ Точно рабочий порядок
    
    print_coords_step("Конвертированные координаты", converted_coords)  
    return converted_coords
	# 📌 Функция извлечения координат из 8 и 9 страниц PDF
def extract_coords(fname):
    reader = PdfReader(fname)
    nazemny_coords = []

    total_pages = len(reader.pages)
    print(f"📄 PDF содержит {total_pages} страниц.")  

    target_pages = []
    if total_pages >= 8:
        target_pages.append(7)  
    if total_pages >= 9:
        target_pages.append(8)  

    if not target_pages:
        print("❌ В PDF нет страниц 8 и 9!")
        return []

    print("\n📜 Извлекаем координаты из PDF...")
    
    for i in target_pages:
        page = reader.pages[i]
        pt = page.extract_text()
        if not pt:
            print(f"⚠ Страница {i+1} пуста!")
            continue

        for line in pt.split("\n"):
            numbers = re.findall(r"\d+\.\d+", line)  
            if len(numbers) >= 2:
                try:
                    raw_y = numbers[0]  
                    raw_x = numbers[1]  

                    x = float(raw_x[:9])  
                    y = raw_y[3:]  
                    if "." not in y:
                        y += ".00"  
                    y = float(y)  

                    x = f"{x:.2f}"
                    y = f"{y:.2f}"

                    print(f"📍 Исправленная точка: X={x}, Y={y}")  
                    nazemny_coords.append((x, y))
                except ValueError:
                    print(f"❌ Ошибка преобразования: {numbers}")
                    continue

    print(f"✅ Итог: найдено {len(nazemny_coords)} точек!")
    return nazemny_coords


# 📌 Функция загрузки сохранённых фигур из JSON
def load_shapes_from_json():
    if not os.path.exists(JSON_FILE):
        print("⚠ Файл shapes.json не найден. Загружаем пустые данные.")
        return {"shapes": []}
    
    try:
        with open(JSON_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            print(f"✅ Загружены фигуры из {JSON_FILE}: {len(data.get('shapes', []))} шт.")
            return data
    except Exception as e:
        print(f"❌ Ошибка при загрузке JSON: {e}")
        return {"shapes": []}

# 📌 Загрузка фигур из JSON
@app.route("/load_shapes", methods=["GET"])
def load_shapes():
    try:
        with open(JSON_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
            print(f"✅ Загружены фигуры: {len(data.get('shapes', []))} шт.")
            return jsonify(data)
    except (FileNotFoundError, json.JSONDecodeError):
        print("⚠ Файл shapes.json отсутствует или повреждён. Возвращаем пустой массив.")
        return jsonify({"shapes": []})



# 📌 Сохранение фигур в JSON (перезапись)
@app.route("/save_shapes", methods=["POST"])
def save_shapes():
    try:
        data = request.get_json()
        shapes = data.get("shapes", [])

        with open(JSON_FILE, "w", encoding="utf-8") as file:
            json.dump({"shapes": shapes}, file, indent=4, ensure_ascii=False)

        print(f"✅ Фигуры сохранены в shapes.json: {len(shapes)} шт.")
        return jsonify({"message": "Фигуры успешно сохранены", "count": len(shapes)})
    except Exception as e:
        print(f"❌ Ошибка сохранения фигур: {e}")
        return jsonify({"error": "Ошибка при сохранении фигур"}), 500




# 📌 API для получения списка PDF
@app.route("/list_pdfs", methods=["GET"])
def list_pdfs():
    pdf_files = [f for f in os.listdir(PDF_FOLDER) if f.endswith(".pdf")]
    return jsonify({"pdfs": pdf_files})

# 📌 API для загрузки и конвертации PDF
@app.route("/load_pdf", methods=["POST"])
def load_pdf():
    filename = request.json.get("filename")
    pdf_path = os.path.join(PDF_FOLDER, filename)

    if not os.path.exists(pdf_path):
        return jsonify({"error": "Файл не найден"}), 404

    extracted_coords = extract_coords(pdf_path)

    if not extracted_coords:
        print("⚠ Контуры не найдены, отправляем пустой массив!")
        return jsonify({"filename": filename, "contours": []})  

    source_crs = "+proj=tmerc +lat_0=0 +lon_0=38.48333333333 +k=1 " \
                 "+x_0=2250000 +y_0=-5712900.566 +ellps=krass " \
                 "+towgs84=-118.754,-61.782,-93.237,2.40896,3.47502,1.29688,6.5177 +units=m +no_defs"
    target_crs = "EPSG:4326"

    wgs84_coords = convert_coords(extracted_coords, source_crs, target_crs)

    response_data = {"filename": filename, "contours": [wgs84_coords]}
    print(f"\n📌 Отправляем на фронт: {response_data}")

    return jsonify(response_data)

# 📌 Раздача главной страницы
@app.route("/")
def index():
    return render_template("index.html")

# 📌 Раздача статических файлов
@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

if __name__ == "__main__":
    app.run(debug=True)

print_shapes_from_db() 