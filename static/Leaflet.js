console.log("🚀 Leaflet.js загружен!");

// ✅ Создаём карту и устанавливаем начальный вид
let map = L.map("map").setView([56.75, 37.61], 14);

// ✅ Добавляем слой OpenStreetMap
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

// ✅ Включаем редактирование
map.editTools = new L.Editable(map);
console.log("✅ map.editTools загружен!");

// ✅ Контейнеры для точек и фигур
let pointLayer = L.layerGroup().addTo(map);
let shapeLayer = L.layerGroup().addTo(map);  
let allPoints = [];
let allShapes = []; // ✅ Храним все созданные фигуры
let pdfBounds = null; 
let currentMode = 'map'; // 'map' или 'building' - ОДНО ОБЪЯВЛЕНИЕ

function getFloorName(floor) {
    return floor === -1 ? 'Подвал' : 
           floor === 0 ? 'Цоколь' : 
           `${floor} этаж`;
}


// 📌 Функция загрузки сохранённых фигур из JSON
function loadShapesFromDB() {
    fetch("/load_shapes")
        .then(response => response.json())
        .then(data => {
            console.log("📌 Загружены фигуры из JSON:", data.shapes);

            // ✅ Удаляем старые фигуры перед загрузкой новых
            allShapes.forEach(shape => map.removeLayer(shape));
            allShapes = [];

            data.shapes.forEach(shape => {
                let newShape;
                if (shape.type === "polygon") {
                    newShape = L.polygon(shape.coords, { color: "red" }).addTo(map);
                } else if (shape.type === "circle") {
                    newShape = L.circle(shape.center, { radius: shape.radius, color: "blue" }).addTo(map);
                } else if (shape.type === "marker") {
                    newShape = L.marker(shape.position).addTo(map);
                }

                if (newShape) {
                    newShape.enableEdit();
                    allShapes.push(newShape);
                }
            });

            console.log("✅ Все сохранённые фигуры загружены!");
        })
        .catch(error => console.error("❌ Ошибка загрузки фигур:", error));
}

// 📌 Функция загрузки PDF и центрирования карты на фигуре
function loadAllPDFs() {
    fetch("/list_pdfs")
        .then(response => response.json())
        .then(data => {
            console.log("📂 Найдено PDF:", data.pdfs);

            data.pdfs.forEach(filename => {
                fetch("/load_pdf", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename: filename })
                })
                .then(response => response.json())
                .then(pdfData => {
                    console.log("📍 Полученные координаты:", pdfData.contours);

                    pdfData.contours.forEach(coords => {
                        console.log("🔷 Добавляем редактируемый полигон:", coords);

                        let pdfShape = L.polygon(coords, { color: "blue" }).addTo(map);
                        pdfShape.enableEdit();
                        allShapes.push(pdfShape);

                        // 🔹 Устанавливаем границы для центрирования
                        pdfBounds = L.latLngBounds(coords);
                    });

                    // ✅ Центрируем карту на PDF-фигуре
                    if (pdfBounds) {
                        map.fitBounds(pdfBounds);
                        console.log("🔄 Центрируем карту на фигуре из PDF...");
                    }
                })
                .catch(error => console.error("❌ Ошибка загрузки PDF:", error));
            });
        });
}

// 📌 Функция сохранения фигур
function saveShapes() {
    let shapesData = allShapes
        .filter(shape => !shape._pdfSource) // ✅ Не сохраняем PDF-фигуры
        .map(shape => {
            if (shape instanceof L.Polygon || shape instanceof L.Polyline) {
                return { type: "polygon", coords: shape.getLatLngs().map(ring => ring.map(latlng => [latlng.lat, latlng.lng])) };
            } else if (shape instanceof L.Circle) {
                let center = shape.getLatLng();
                return { type: "circle", center: [center.lat, center.lng], radius: shape.getRadius() };
            } else if (shape instanceof L.Marker) {
                let pos = shape.getLatLng();
                return { type: "marker", position: [pos.lat, pos.lng] };
            }
            return null;
        })
        .filter(shape => shape !== null);

    console.log("📌 Сохраняем фигуры:", shapesData);

    fetch("/save_shapes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shapes: shapesData })
    })
    .then(response => response.json())
    .then(data => {
        console.log("✅ Фигуры сохранены:", data);
        alert("✅ Фигуры успешно сохранены!");
    })
    .catch(error => console.error("❌ Ошибка сохранения фигур:", error));
}

// 📌 Функция удаления последней фигуры
function deleteLastShape() {
    if (allShapes.length > 0) {
        let lastShape = allShapes.pop();
        map.removeLayer(lastShape);
        console.log("🗑 Удалена последняя фигура!");
    } else {
        console.log("⚠ Нет фигур для удаления!");
    }
}

// ✅ Добавляем кнопки редактора
console.log("ℹ️ Добавляем кнопки редактора...");

L.EditControl = L.Control.extend({
    options: {
        position: "topleft",
        callback: null,
        kind: "",
        html: "",
    },
    onAdd: function (map) {
        let container = L.DomUtil.create("div", "leaflet-control leaflet-bar"),
            link = L.DomUtil.create("a", "", container);
        link.href = "#";
        link.title = `Создать ${this.options.kind}`;
        link.innerHTML = this.options.html;

        L.DomEvent.on(link, "click", L.DomEvent.stop).on(link, "click", () => {
            if (this.options.callback) {
                let newShape = this.options.callback.call(map.editTools);
                if (newShape) {
                    allShapes.push(newShape);
                }
            }
        });

        return container;
    },
});

// ✅ Кнопки
map.addControl(new L.EditControl({ position: "topleft", callback: () => map.editTools.startPolygon(), kind: "полигон", html: "▰" }));
map.addControl(new L.EditControl({ position: "topleft", callback: () => map.editTools.startRectangle(), kind: "прямоугольник", html: "⬛️" }));
map.addControl(new L.EditControl({ position: "topleft", callback: () => map.editTools.startCircle(), kind: "круг", html: "⬤" }));
map.addControl(new L.EditControl({ position: "topleft", callback: () => map.editTools.startMarker(), kind: "маркер", html: "🖈" }));


// ✅ Кнопка удаления последней фигуры
L.DeleteLastShapeControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
        let container = L.DomUtil.create("div", "leaflet-control leaflet-bar"),
            link = L.DomUtil.create("a", "", container);
        link.href = "#";
        link.title = "Удалить последнюю фигуру";
        link.innerHTML = "🗑";
        L.DomEvent.on(link, "click", L.DomEvent.stop).on(link, "click", deleteLastShape);
        return container;
    },
});
map.addControl(new L.DeleteLastShapeControl());

// ✅ Кнопка сохранения фигур
L.SaveShapesControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
        let container = L.DomUtil.create("div", "leaflet-control leaflet-bar"),
            link = L.DomUtil.create("a", "", container);
        link.href = "#";
        link.title = "Сохранить фигуры";
        link.innerHTML = "💾";
        L.DomEvent.on(link, "click", L.DomEvent.stop).on(link, "click", saveShapes);
        return container;
    },
});
map.addControl(new L.SaveShapesControl());

console.log("✅ Кнопки добавлены!");
async function startNewBuilding() {
    const res = await fetch('/static/pages/');
    const files = await fetch('/static/pages/index.json').then(r => r.json()); // или реализуйте генерацию списка иначе
    const container = document.getElementById("imageSelection");
    container.innerHTML = "";

    files.forEach(file => {
        const img = document.createElement("img");
        img.src = "/static/pages/" + file;
        img.dataset.filename = file;
        img.onclick = () => img.classList.toggle("selected");
        container.appendChild(img);
    });

    document.getElementById("newBuildingModal").style.display = "block";
}

async function saveBuilding() {
    const selected = Array.from(document.querySelectorAll(".image-grid img.selected")).map(img => img.dataset.filename);
    const name = document.getElementById("buildingName").value.trim();
    if (!name || selected.length === 0) return alert("Укажите имя и выберите изображения");

    const res = await fetch("/save_building", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, files: selected })
    });

    loadBuildings();
    document.getElementById("newBuildingModal").style.display = "none";
}

async function loadBuildings() {
    const res = await fetch("/list_buildings");
    const buildings = await res.json();
    const container = document.getElementById("buildings");
    container.innerHTML = "";

    buildings.forEach(building => {
        const btn = document.createElement("button");
        btn.innerText = building.name;
        btn.onclick = () => showImages(building.images);
        container.appendChild(btn);
    });
}

function showImages(images) {
    const container = document.getElementById("buildings");
    container.innerHTML = "";

    images.forEach(src => {
        const img = document.createElement("img");
        img.src = src;
        img.onclick = () => {
            document.getElementById("fullImage").src = src;
            document.getElementById("fullscreenView").style.display = "flex";
        };
        container.appendChild(img);
    });

    const back = document.createElement("button");
    back.innerText = "← Назад";
    back.onclick = loadBuildings;
    container.insertBefore(back, container.firstChild);
}

// Функция переключения вкладок
function switchTab(tabName) {
    currentMode = tabName;
    
    // Переключение вкладок
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
    
    // Переключение видимости элементов
    if (tabName === 'map') {
        document.getElementById('map').style.display = 'block';
        document.getElementById('buildingWorkspace').style.display = 'none';
        map.invalidateSize();
    } else {
        document.getElementById('map').style.display = 'none';
        document.getElementById('buildingWorkspace').style.display = 'block';
        initializeFloorsTable(); // Инициализируем список этажей
    }
}
async function addNewFloorToTable() {
    const floorName = prompt('Введите название нового этажа:', 'Новый этаж');
    if (floorName) {
        const newFloor = {
            id: Date.now(),
            name: floorName
        };

        // 👇 отправка на сервер
        const res = await fetch("/add_floor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newFloor)
        });

        const result = await res.json();
        alert(result.message);

        addFloorRow(newFloor); // локально тоже отобразим
    }
}
async function loadFloors() {
    const res = await fetch("/get_floors_list");
    const floors = await res.json();

    const list = document.getElementById("floorsList");
    list.innerHTML = "";
    floors.forEach(floor => addFloorRow(floor));
}

// Инициализация вкладок в window.onload
window.onload = function() {
    loadShapesFromDB();
    setTimeout(loadAllPDFs, 1000);
    
    // Обработчики для вкладок
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
    
    // Обработчик кнопки добавления этажа
    document.getElementById('addFloorBtn')?.addEventListener('click', addNewFloorToTable);
};


// Добавьте обработчики для вкладок в window.onload


// Модифицируйте функцию showBuildingWorkspace
function showBuildingWorkspace() {
    // Теперь рабочая область здания уже есть в HTML, просто заполняем её
    initializeFloorsTable();
    
    // Удалите старую модальную версию этой функции, если она есть
}

// Остальные функции остаются без изменений

// 2. Функция для отображения рабочего пространства
function showBuildingWorkspace() {
    // Создаём модальное окно
    const modal = document.createElement('div');
    modal.id = 'buildingWorkspaceModal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.9)';
    modal.style.display = 'flex';
    modal.style.zIndex = '2000';
    
    // Контейнер для всего содержимого
    const workspace = document.createElement('div');
    workspace.style.display = 'flex';
    workspace.style.width = '100%';
    workspace.style.height = '100%';
    
    // 3. Панель этажей (слева)
    const floorsPanel = document.createElement('div');
    floorsPanel.style.width = '300px';
    floorsPanel.style.backgroundColor = '#f5f5f5';
    floorsPanel.style.padding = '20px';
    floorsPanel.style.overflowY = 'auto';
    
    const floorsHeader = document.createElement('h2');
    floorsHeader.textContent = 'Этажи здания k234';
    floorsHeader.style.marginTop = '0';
    floorsHeader.style.color = '#333';
    
    // Таблица этажей
    const floorsTable = document.createElement('div');
    floorsTable.id = 'floorsTable';
    floorsTable.style.marginTop = '20px';
    
    // Кнопка добавления этажа
    const addFloorBtn = document.createElement('button');
    addFloorBtn.textContent = '+ Добавить этаж';
    addFloorBtn.style.marginTop = '20px';
    addFloorBtn.style.padding = '8px 12px';
    addFloorBtn.style.backgroundColor = '#4CAF50';
    addFloorBtn.style.color = 'white';
    addFloorBtn.style.border = 'none';
    addFloorBtn.style.borderRadius = '4px';
    addFloorBtn.style.cursor = 'pointer';
    
    addFloorBtn.addEventListener('click', () => {
        addNewFloorToTable();
    });
    
    floorsPanel.appendChild(floorsHeader);
    floorsPanel.appendChild(floorsTable);
    floorsPanel.appendChild(addFloorBtn);
    
    // 4. Основная рабочая область (карта)
    const workArea = document.createElement('div');
    workArea.style.flex = '1';
    workArea.style.position = 'relative';
    
    // Контейнер для карты
    const mapContainer = document.createElement('div');
    mapContainer.id = 'buildingMapContainer';
    mapContainer.style.width = '100%';
    mapContainer.style.height = '100%';
    mapContainer.style.backgroundColor = '#ddd';
    
    // Заглушка для карты (можно заменить на реальную карту)
    const mapPlaceholder = document.createElement('div');
    mapPlaceholder.style.display = 'flex';
    mapPlaceholder.style.justifyContent = 'center';
    mapPlaceholder.style.alignItems = 'center';
    mapPlaceholder.style.width = '100%';
    mapPlaceholder.style.height = '100%';
    mapPlaceholder.style.color = '#666';
    mapPlaceholder.textContent = 'Рабочая область карты';
    
    mapContainer.appendChild(mapPlaceholder);
    workArea.appendChild(mapContainer);
    
    // 5. Собираем всё вместе
    workspace.appendChild(floorsPanel);
    workspace.appendChild(workArea);
    modal.appendChild(workspace);
    document.body.appendChild(modal);
    
    // 6. Добавляем кнопку закрытия
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '10px';
    closeBtn.style.right = '10px';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.backgroundColor = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.color = 'white';
    closeBtn.style.cursor = 'pointer';
    
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.appendChild(closeBtn);
    
    // 7. Заполняем таблицу этажей
    initializeFloorsTable();
}

// 8. Инициализация таблицы этажей
function initializeFloorsTable() {
    const floorsTable = document.getElementById('floorsList'); // Изменили на floorsList
    if (!floorsTable) return;
    
    floorsTable.innerHTML = '';
    
    // Пример данных (можно заменить на загрузку с сервера)
    const floors = [
        { id: 1, name: 'Подвал', selected: false },
        { id: 2, name: 'Цокольный этаж', selected: false },
        { id: 3, name: '1 этаж', selected: true },
        { id: 4, name: '2 этаж', selected: false }
    ];
    
    floors.forEach(floor => {
        addFloorRow(floor);
    });
}

// 9. Добавление строки этажа в таблицу
function addFloorRow(floor) {
    const floorsTable = document.getElementById('floorsList'); // Изменили на floorsList
    if (!floorsTable) return;
    
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.padding = '10px';
    row.style.marginBottom = '5px';
    row.style.backgroundColor = floor.selected ? '#e0f7fa' : '#fff';
    row.style.border = '1px solid #ddd';
    row.style.borderRadius = '4px';
    row.style.cursor = 'pointer';
    
    row.addEventListener('click', () => {
        document.querySelectorAll('#floorsList > div').forEach(r => {
            r.style.backgroundColor = '#fff';
        });
        row.style.backgroundColor = '#e0f7fa';
        loadFloorData(floor.id);
    });
    
    const floorName = document.createElement('span');
    floorName.textContent = floor.name;
    floorName.style.flex = '1';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.style.marginLeft = '10px';
    deleteBtn.style.backgroundColor = 'transparent';
    deleteBtn.style.border = 'none';
    deleteBtn.style.color = '#f44336';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.fontSize = '18px';
    
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Удалить этаж "${floor.name}"?`)) {
            floorsTable.removeChild(row);
        }
    });
    
    row.appendChild(floorName);
    row.appendChild(deleteBtn);
    floorsTable.appendChild(row);
}

// 10. Добавление нового этажа
function addNewFloorToTable() {
    const floorName = prompt('Введите название нового этажа:', 'Новый этаж');
    if (floorName) {
        const newFloor = {
            id: Date.now(),
            name: floorName,
            selected: false
        };
        addFloorRow(newFloor);
    }
}


// 11. Загрузка данных этажа
function loadFloorData(floorId) {
    console.log(`Загрузка данных для этажа ${floorId}`);
    // Здесь можно реализовать загрузку данных этажа
}
async function showPngAttachModal(floorId) {
    try {
        const response = await fetch('/get_available_pngs');
        const data = await response.json();

        if (!data.pngs || data.pngs.length === 0) {
            alert('Нет доступных PNG-изображений');
            return;
        }

        let selectedIndex = 0;

        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.95)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '9999';

        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '30px';
        container.style.maxWidth = '95%';
        container.style.maxHeight = '95%';

        const image = document.createElement('img');
        image.src = `/png_pages/${data.pngs[selectedIndex]}`;
        image.style.maxHeight = '95vh';
        image.style.maxWidth = '70vw';
        image.style.objectFit = 'contain';
        image.style.border = '2px solid white';
        image.style.boxShadow = '0 0 20px black';

        const buttonPanel = document.createElement('div');
        buttonPanel.style.display = 'flex';
        buttonPanel.style.flexDirection = 'column';
        buttonPanel.style.gap = '15px';

        const makeBtn = (text, handler, color = 'white', bg = '#333') => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.padding = '10px 20px';
            btn.style.fontSize = '18px';
            btn.style.cursor = 'pointer';
            btn.style.backgroundColor = bg;
            btn.style.color = color;
            btn.style.border = 'none';
            btn.style.borderRadius = '5px';
            btn.onclick = handler;
            return btn;
        };

        const upBtn = makeBtn('↑', () => {
            selectedIndex = (selectedIndex - 1 + data.pngs.length) % data.pngs.length;
            image.src = `/png_pages/${data.pngs[selectedIndex]}`;
        });

        const downBtn = makeBtn('↓', () => {
            selectedIndex = (selectedIndex + 1) % data.pngs.length;
            image.src = `/png_pages/${data.pngs[selectedIndex]}`;
        });

        const saveBtn = makeBtn('Сохранить', async () => {
            const png = data.pngs[selectedIndex];
            try {
                const res = await fetch('/attach_png_to_floor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ floor_id: floorId, png_name: png })
                });
                const result = await res.json();
                alert(result.message);
                document.body.removeChild(modal);
            } catch (error) {
                alert('Ошибка при сохранении PNG');
                console.error(error);
            }
        }, 'white', '#4CAF50');

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '20px';
        closeBtn.style.right = '30px';
        closeBtn.style.fontSize = '28px';
        closeBtn.style.color = 'white';
        closeBtn.style.background = 'transparent';
        closeBtn.style.border = 'none';
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = () => document.body.removeChild(modal);

        buttonPanel.appendChild(upBtn);
        buttonPanel.appendChild(downBtn);
        buttonPanel.appendChild(saveBtn);

        container.appendChild(image);
        container.appendChild(buttonPanel);
        modal.appendChild(container);
        modal.appendChild(closeBtn);
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Ошибка при загрузке PNG:', error);
        alert('Ошибка при открытии PNG-выбора');
    }
}




// Модифицируем функцию addFloorRow для добавления кнопки прикрепления изображения
function addFloorRow(floor) {
    const floorsTable = document.getElementById('floorsList');
    if (!floorsTable) return;
    
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.padding = '10px';
    row.style.marginBottom = '5px';
    row.style.backgroundColor = floor.selected ? '#e0f7fa' : '#fff';
    row.style.border = '1px solid #ddd';
    row.style.borderRadius = '4px';
    row.style.cursor = 'pointer';
    
	row.addEventListener('click', () => {
		document.querySelectorAll('#floorsList > div').forEach(r => {
			r.style.backgroundColor = '#fff';
		});
		row.style.backgroundColor = '#e0f7fa';
		loadFloorImageForView(floor.id); // 👈 Загружаем PNG
	});

    
    const floorName = document.createElement('span');
    floorName.textContent = floor.name;
    floorName.style.flex = '1';
    
    // Кнопка прикрепления изображения
    const attachBtn = document.createElement('button');
    attachBtn.textContent = 'Прикрепить PNG';
    attachBtn.style.marginLeft = '10px';
    attachBtn.style.padding = '5px 10px';
    attachBtn.style.backgroundColor = '#4CAF50';
    attachBtn.style.color = 'white';
    attachBtn.style.border = 'none';
    attachBtn.style.borderRadius = '4px';
    attachBtn.style.cursor = 'pointer';
    
    attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showPngAttachModal(floor.id);
    });
    
    // Кнопка удаления
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.style.marginLeft = '10px';
    deleteBtn.style.backgroundColor = 'transparent';
    deleteBtn.style.border = 'none';
    deleteBtn.style.color = '#f44336';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.fontSize = '18px';
    
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Удалить этаж "${floor.name}"?`)) {
            floorsTable.removeChild(row);
        }
    });
    
    row.appendChild(floorName);
    row.appendChild(attachBtn);
    row.appendChild(deleteBtn);
    floorsTable.appendChild(row);
}
async function loadFloorImageForView(floorId) {
    const container = document.getElementById('floorImageContainer');
    container.innerHTML = 'Загрузка...';

    try {
        const response = await fetch(`/get_floor_image?floor_id=${floorId}`);
        const data = await response.json();

        console.log("🔍 Получено изображение для этажа:", data);

        if (!data.image) {
            container.innerHTML = '<p>К этому этажу не прикреплено изображение</p>';
            return;
        }

        container.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.overflow = 'hidden';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.cursor = 'grab';

        const img = document.createElement('img');
        img.src = `/png_pages/${data.image}`;
        img.style.position = 'absolute';
        img.style.transformOrigin = '0 0';
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
		img.style.userSelect = 'none';      
		img.style.pointerEvents = 'auto';  
		img.draggable = false;             
        wrapper.appendChild(img);

        const scaleDisplay = document.createElement('div');
        scaleDisplay.id = 'drawingScale';
        scaleDisplay.style.position = 'absolute';
        scaleDisplay.style.top = '10px';
        scaleDisplay.style.left = '10px';
        scaleDisplay.style.zIndex = '1000';
        scaleDisplay.style.fontSize = '14px';
        scaleDisplay.style.fontWeight = 'bold';
        scaleDisplay.style.background = 'transparent';
        scaleDisplay.style.color = '#000';
        scaleDisplay.style.pointerEvents = 'none';
        scaleDisplay.innerHTML = '1:<span id="scaleValue">100</span>';
        content.appendChild(scaleDisplay);

        // Линейка
        const ruler = document.createElement('div');
        ruler.style.position = 'absolute';
        ruler.style.top = '20px';
        ruler.style.left = '20px';
        ruler.style.height = '30px';
        ruler.style.cursor = 'move';
        ruler.style.display = 'flex';
        ruler.style.alignItems = 'center';
        ruler.style.zIndex = '1000';

        const rulerLine = document.createElement('div');
        rulerLine.style.height = '2px';
        rulerLine.style.backgroundColor = '#333';
        rulerLine.style.flexGrow = '1';
        rulerLine.style.position = 'relative';

        const resizeHandle = document.createElement('div');
        resizeHandle.style.width = '10px';
        resizeHandle.style.height = '20px';
        resizeHandle.style.backgroundColor = '#333';
        resizeHandle.style.cursor = 'ew-resize';
        resizeHandle.style.position = 'absolute';
        resizeHandle.style.right = '-5px';
        resizeHandle.style.top = '50%';
        resizeHandle.style.transform = 'translateY(-50%)';

		const leftHandle = document.createElement('div');
		leftHandle.style.width = '10px';
		leftHandle.style.height = '20px';
		leftHandle.style.backgroundColor = '#333';
		leftHandle.style.cursor = 'ew-resize';
		leftHandle.style.position = 'absolute';
		leftHandle.style.left = '-5px';
		leftHandle.style.top = '50%';
		leftHandle.style.transform = 'translateY(-50%)';
		
		rulerLine.appendChild(leftHandle);
        rulerLine.appendChild(resizeHandle);
        ruler.appendChild(rulerLine);
        wrapper.appendChild(ruler);

        const lengthDisplay = document.createElement('div');
        lengthDisplay.style.position = 'absolute';
        lengthDisplay.style.top = '10px';
        lengthDisplay.style.right = '10px';
        lengthDisplay.style.background = 'rgba(255,255,255,0.9)';
        lengthDisplay.style.padding = '8px 12px';
        lengthDisplay.style.borderRadius = '4px';
        lengthDisplay.style.fontFamily = 'Arial, sans-serif';
        lengthDisplay.style.zIndex = '1000';
        wrapper.appendChild(lengthDisplay);

		const content = document.createElement('div');
		content.style.position = 'absolute';
		content.style.top = '0';
		content.style.left = '0';
		content.style.transformOrigin = '0 0';

		content.appendChild(img);
		content.appendChild(ruler);

		wrapper.appendChild(content);

        // Таблица в левом нижнем углу
        const scaleTable = document.createElement('table');
        scaleTable.style.position = 'absolute';
        scaleTable.style.bottom = '20px';
        scaleTable.style.left = '20px';
        scaleTable.style.background = 'rgba(255, 255, 255, 0.95)';
        scaleTable.style.border = '1px solid #ccc';
        scaleTable.style.borderCollapse = 'collapse';
        scaleTable.style.fontFamily = 'Arial, sans-serif';
        scaleTable.style.fontSize = '14px';
        scaleTable.style.zIndex = '1000';
        scaleTable.style.boxShadow = '0 0 4px rgba(0,0,0,0.2)';

        // Структура таблицы
        scaleTable.innerHTML = `
            <tr>
                <td style="padding: 6px; border: 1px solid #ccc;">По линейке (м)</td>
                <td id="measuredLength" style="padding: 6px; border: 1px solid #ccc;">0.00</td>
            </tr>
            <tr>
                <td style="padding: 6px; border: 1px solid #ccc;">По чертежу (м)</td>
                <td style="padding: 6px; border: 1px solid #ccc;">
                    <input id="actualLengthInput" type="number" step="any" style="width: 80px; padding: 4px;" placeholder="введите" />
                </td>
            </tr>
            <tr>
                <td style="padding: 6px; border: 1px solid #ccc;">Совпадение</td>
                <td id="matchPercent" style="padding: 6px; border: 1px solid #ccc;">—</td>
            </tr>
        `;

        wrapper.appendChild(scaleTable);


        // Параметры линейки и масштабирования
        let isDraggingRuler = false;
        let isResizing = false;
        let startX = 0;
        let rulerWidth = 100;
        let rulerX = 20;
        let rulerY = 20;
        let pixelsPerMeter = 50;

// 1. Настройка переменных
		let pointA = { x: 100, y: 100 };
		let pointB = { x: 200, y: 150 };
		pixelsPerMeter = 62; // Примерная шкала (попробуй под себя подогнать)
        
        const updateScaleDisplay = () => {
            const scaleValueEl = document.getElementById('scaleValue');
            if (!scaleValueEl) return;
        
            const metersPerPixel = 1 / pixelsPerMeter;
            const drawingScale = Math.round(1 / (metersPerPixel * currentZoom));
            scaleValueEl.textContent = drawingScale;
        };


		// 2. Создание ручек, линии и метки
		const createHandle = (x, y) => {
			const handle = document.createElement('div');
			handle.style.position = 'absolute';
			handle.style.width = '12px';
			handle.style.height = '12px';
			handle.style.backgroundColor = '#4CAF50';
			handle.style.border = '2px solid white';
			handle.style.borderRadius = '50%';
			handle.style.cursor = 'pointer';
			handle.style.left = `${x - 6}px`;
			handle.style.top = `${y - 6}px`;
			handle.style.zIndex = '1000';
			handle.style.userSelect = 'none';
			handle.classList.add('ruler-handle');
			return handle;
		};

		const handleA = createHandle(pointA.x, pointA.y);
		const handleB = createHandle(pointB.x, pointB.y);

		const line = document.createElement('div');
		line.style.position = 'absolute';
		line.style.height = '2px';
		line.style.backgroundColor = '#333';
		line.style.transformOrigin = '0 0';
		line.style.zIndex = '999';

		const label = document.createElement('div');
		label.style.position = 'absolute';
		label.style.background = 'white';
		label.style.padding = '2px 6px';
		label.style.borderRadius = '4px';
		label.style.fontSize = '14px';
		label.style.fontFamily = 'Arial, sans-serif';
		label.style.zIndex = '1001';
		label.style.boxShadow = '0 0 3px rgba(0,0,0,0.3)';

		// 3. Функция обновления линейки
		function updateRulerVisual() {
			const dx = pointB.x - pointA.x;
			const dy = pointB.y - pointA.y;
			const length = Math.sqrt(dx * dx + dy * dy);
			const angle = Math.atan2(dy, dx) * 180 / Math.PI;

			line.style.left = `${pointA.x}px`;
			line.style.top = `${pointA.y}px`;
			line.style.width = `${length}px`;
			line.style.transform = `rotate(${angle}deg)`;

			handleA.style.left = `${pointA.x - 6}px`;
			handleA.style.top = `${pointA.y - 6}px`;
			handleB.style.left = `${pointB.x - 6}px`;
			handleB.style.top = `${pointB.y - 6}px`;

			const meters = (length / pixelsPerMeter).toFixed(2);
			label.textContent = `${meters} м`;
			label.style.left = `${(pointA.x + pointB.x) / 2 + 10}px`;
			label.style.top = `${(pointA.y + pointB.y) / 2 - 10}px`;
            



            const measuredEl = document.getElementById('measuredLength');
            if (measuredEl) measuredEl.textContent = meters;

            const actualInput = document.getElementById('actualLengthInput');
            const matchEl = document.getElementById('matchPercent');
            if (actualInput && matchEl) {
                const actual = parseFloat(actualInput.value);
                const measured = parseFloat(meters);
                if (!isNaN(actual) && actual > 0 && measured > 0) {
                    const smaller = Math.min(measured, actual);
                    const larger = Math.max(measured, actual);
                    const percent = ((smaller / larger) * 100).toFixed(1);
                    matchEl.textContent = `${percent}%`;
                } else {
                    matchEl.textContent = '—';
                }
            }
            updateScaleDisplay();
		}

        document.getElementById('actualLengthInput')?.addEventListener('input', updateRulerVisual);

// 4. Добавить в DOM
		
		content.appendChild(line);
		content.appendChild(handleA);
		content.appendChild(handleB);
		content.appendChild(label);

// 5. Добавить перетаскивание
			function makeDraggable(handle, pointRef) {
				let isDragging = false;
				let offsetX = 0;
				let offsetY = 0;

				handle.classList.add('ruler-handle');

				const onMouseDown = (e) => {
					isDragging = true;
					e.stopPropagation();
					e.preventDefault();

        // Координаты ручки в системе content
					const rect = content.getBoundingClientRect();
					const mouseX = e.clientX - rect.left;
					const mouseY = e.clientY - rect.top;

        // Сохраняем смещение между мышью и текущей точкой
					offsetX = (mouseX - window.posX) / window.currentZoom - pointRef.x;
					offsetY = (mouseY - window.posY) / window.currentZoom - pointRef.y;
				};

				const onMouseMove = (e) => {
					if (!isDragging) return;

					const rect = content.getBoundingClientRect();
					const mouseX = e.clientX - rect.left;
					const mouseY = e.clientY - rect.top;

					pointRef.x = (mouseX - window.posX) / window.currentZoom - offsetX;
					pointRef.y = (mouseY - window.posY) / window.currentZoom - offsetY;

					updateRulerVisual();
				};

				const onMouseUp = () => {
					isDragging = false;
				};

				handle.addEventListener('mousedown', onMouseDown);
				window.addEventListener('mousemove', onMouseMove);
				window.addEventListener('mouseup', onMouseUp);
			}


		makeDraggable(handleA, pointA);
		makeDraggable(handleB, pointB);

		// 6. Первоначальное отображение
		updateRulerVisual();



        document.addEventListener('mousemove', (e) => {
			if (isDraggingRuler) {
				rulerX = initialRulerX + (e.clientX - startX) / window.currentZoom;
				rulerY = initialRulerY + (e.clientY - startY) / window.currentZoom;
				updateRuler();
			}

			if (isResizing) {
				const delta = (e.clientX - startX) / window.currentZoom;
    
				if (resizeDirection === 'right') {
					rulerWidth += delta;
					rulerWidth = Math.max(50, rulerWidth);
				} else if (resizeDirection === 'left') {
					rulerWidth -= delta;
					rulerWidth = Math.max(50, rulerWidth);
					rulerX += delta;
				}

				startX = e.clientX; // обновляем позицию
				updateRuler();
			}
        });

		document.addEventListener('mouseup', () => {
			window.isDraggingHandle = false;
			isResizing = false;
			resizeDirection = null;
		});


        // Масштабирование и перетаскивание изображения
        window.currentZoom = 1;
        window.posX = 0;
        window.posY = 0;
        window.isDraggingImage = false;
        window.imgStartX = 0;
        window.imgStartY = 0;

        const updateTransform = () => {
            content.style.transform = `translate(${window.posX}px, ${window.posY}px) scale(${window.currentZoom})`;
        };

        wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.3 : 0.3;
            const oldZoom = window.currentZoom;
            window.currentZoom = Math.min(Math.max(0.2, window.currentZoom + delta), 10);

            const rect = wrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            window.posX = mouseX - (mouseX - window.posX) * (window.currentZoom / oldZoom);
            window.posY = mouseY - (mouseY - window.posY) * (window.currentZoom / oldZoom);

            const updateTransform = () => {
                content.style.transform = `translate(${posX}px, ${posY}px) scale(${currentZoom})`;
            }
            updateTransform();
            updateScaleDisplay();
        });

        wrapper.addEventListener('mousedown', (e) => {
            const tag = e.target.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                return; // 🔒 Не начинаем перетаскивание, если клик по input
            }
        
            if (e.button === 0 && !isDraggingRuler && !isResizing && !e.target.classList.contains('ruler-handle')) {
                window.isDraggingImage = true;
                window.imgStartX = e.clientX - window.posX;
                window.imgStartY = e.clientY - window.posY;
                wrapper.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });


        document.addEventListener('mousemove', (e) => {
            if (window.isDraggingImage) {
                window.posX = e.clientX - window.imgStartX;
                window.posY = e.clientY - window.imgStartY;
                updateTransform();
            }
        });

        document.addEventListener('mouseup', () => {
			isDragging = false;
            window.isDraggingImage = false;
            wrapper.style.cursor = 'grab';
        });

        document.addEventListener('keydown', (e) => {
            if (!container.contains(document.activeElement)) return;
            if (e.key === '+' || e.key === '=') {
                window.currentZoom = Math.min(10, window.currentZoom + 0.1);
                updateTransform();
                updateScaleDisplay();
                e.preventDefault();
            } else if (e.key === '-' || e.key === '_') {
                window.currentZoom = Math.max(0.2, window.currentZoom - 0.1);
                updateTransform();
                updateScaleDisplay();
                e.preventDefault();
            }
        });

        
        updateTransform();
        container.appendChild(wrapper);

    } catch (error) {
        console.error('❌ Ошибка при загрузке изображения этажа:', error);
        container.innerHTML = '<p>Произошла ошибка при загрузке изображения</p>';
    }
}

document.addEventListener('input', (e) => {
    if (e.target.id === 'actualLengthInput') {
        updateRulerVisual(); // 🔁 пересчитываем % совпадения
    }
});


// 🔄 Загружаем данные при старте
window.onload = function() {
    loadShapesFromDB();
    setTimeout(loadAllPDFs, 1000);
    
    // Инициализация вкладок
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
    
    // Инициализация кнопки добавления этажа
    document.getElementById('addFloorBtn').addEventListener('click', addNewFloorToTable);
};