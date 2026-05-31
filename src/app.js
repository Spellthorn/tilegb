// DOM Elements
const projectTitle = document.getElementById("projectTitle");
const projectTitleInput = document.getElementById("projectTitleInput");
const editProjectBtn = document.getElementById("editProjectBtn");


// Handle Editing Project Title

editProjectBtn.onclick = enterEditMode;

function enterEditMode() {
    projectTitleInput.value = projectTitle.textContent;

    projectTitle.classList.add("hidden");
    projectTitleInput.classList.remove("hidden");

    projectTitleInput.focus();
    projectTitleInput.select();
}

function exitEditMode() {
    const name = projectTitleInput.value.trim();

    projectTitle.textContent = name.length ? name : "Untitled Project";

    projectTitle.classList.remove("hidden");
    projectTitleInput.classList.add("hidden");
}

projectTitleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") exitEditMode();
    if (e.key === "Escape") {
        projectTitleInput.value = projectTitle.textContent;
        exitEditMode();
    }
})


// Image Section Logic

const images = [];
let selectedImage = null;

const uploadInput = document.getElementById("imageUpload");
const imageList = document.getElementById("imageList");
uploadInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);

    let lastAdded = null;

    for (const file of files) {
        const imageData = await fileToDataURL(file);

        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");

        const imageObject = {
            id: crypto.randomUUID(),
            name: nameWithoutExt,
            imageData,
            flipAwareDedup: false
        };

        images.push(imageObject);
        lastAdded = imageObject;
    }

    if (!lastAdded) return;

    selectedImage = lastAdded;

    renderImages();

    drawToCanvas(selectedImage);

    syncDedupUI();
    syncCopyImageUI();

    uploadInput.value = "";
});

function renderImages() {
    imageList.innerHTML = "";

    [...images].reverse().forEach(img => {
        const item = document.createElement("div");
        item.className = "image-item";

        if (selectedImage?.id === img.id) {
            item.classList.add("selected");
        }

        const thumb = document.createElement("img");
        thumb.className = "thumb";
        thumb.src = img.imageData;

        thumb.width = 32;
        thumb.height = 32;

        const name = document.createElement("div");
        name.className = "name";
        name.textContent = img.name;

        item.addEventListener("click", (e) => {

            if (e.ctrlKey) {
                const index = images.findIndex(i => i.id === img.id);

                if (index !== -1) {
                    const wasSelected = selectedImage?.id === img.id;

                    images.splice(index, 1);

                    if (wasSelected) {
                        selectedImage = images[images.length - 1] ?? null;

                        if (selectedImage) {
                            drawToCanvas(selectedImage);
                            syncDedupUI();
                        } else {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            uniqueTiles = [];
                            tileMap.clear();
                            renderTiles();
                            syncDedupUI();
                            syncCopyImageUI();
                        }
                    }

                    renderImages();
                }
                return;
            }

            selectedImage = img;

            renderImages();
            drawToCanvas(img);

            syncDedupUI();
            syncCopyImageUI();
        });
        item.appendChild(thumb);
        item.appendChild(name);

        imageList.appendChild(item);
    });
}


// Canvas Section

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Draw image to canvas
function drawToCanvas(imgObj) {
    if (!imgObj || !imgObj.imageData) return;

    const image = new Image();

    image.onload = () => {

        // Fill background FIRST (this is the key fix)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "white"; // or "black" depending on your toolchain
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Then draw image on top
        ctx.drawImage(image, 0, 0);

        if (selectedImage) {
            selectedImage.width = image.width;
            selectedImage.height = image.height;
        }

        extractTilesFromImage();
    };

    image.src = imgObj.imageData;
}


// Handle Tile Extraction
let uniqueTiles = [];
let tileIndexMap = [];
let tileMap = new Map();


function hashTile(tile) {
    return tile.join(",");
}

// Extract Tiles
function extractTilesFromImage() {
    const imageData = ctx.getImageData(0, 0, 256, 256);
    const data = imageData.data;

    uniqueTiles = [];
    tileIndexMap = [];
    tileMap.clear();

    const imgW = selectedImage.width;
    const imgH = selectedImage.height;

    const tilesX = Math.ceil(imgW / 8);
    const tilesY = Math.ceil(imgH / 8);

    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {

            const tile = [];

            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {

                    const px = tx * 8 + x;
                    const py = ty * 8 + y;

                    const clampedX = Math.min(px, imgW - 1);
                    const clampedY = Math.min(py, imgH - 1);

                    const index = (clampedY * 256 + clampedX) * 4;

                    tile.push(
                        data[index],     // R
                        data[index + 1], // G
                        data[index + 2], // B
                        data[index + 3]  // A
                    );
                }
            }

            tileIndexMap.push(processTile(tile));
        }
    }

    updateSidebar(tilesX, tilesY);
    renderTiles();
    updateCopyImage();
}

// Dedup tiles
function processTile(tile) {

    const baseHash = hashTile(tile);

    // NORMAL dedup only
    if (!selectedImage?.flipAwareDedup) {
        if (tileMap.has(baseHash)) return;

        tileMap.set(baseHash, uniqueTiles.length);
        uniqueTiles.push(tile);
        return;
    }

    // FLIP-AWARE dedup
    const variants = [
        tile,
        getFlippedTile(tile, true, false),
        getFlippedTile(tile, false, true),
        getFlippedTile(tile, true, true)
    ];

    let bestHash = null;

    for (const v of variants) {
        const hash = hashTile(v);

        if (!bestHash) bestHash = hash;

        if (tileMap.has(hash)) {
            return;
        }
    }

    tileMap.set(bestHash, uniqueTiles.length);
    uniqueTiles.push(tile);
}

// Display Stats in Sidebar
function updateSidebar(tileWidth, tileHeight) {
    document.getElementById("uniqueCount").textContent = uniqueTiles.length;
    document.getElementById("tileWidth").textContent = tileWidth;
    document.getElementById("tileHeight").textContent = tileHeight;
}

// Render Tiles
function renderTiles() {
    const grid = document.getElementById("tileGrid");
    grid.innerHTML = "";

    uniqueTiles.forEach(tile => {
        const div = document.createElement("div");
        div.className = "tile";

        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;

        const tctx = canvas.getContext("2d");

        const imageData = tctx.createImageData(8, 8);
        imageData.data.set(tile);

        tctx.putImageData(imageData, 0, 0);

        div.appendChild(canvas);
        grid.appendChild(div);
    });
}

// Dedup flippable tiles for sprites
const dedupToggle = document.getElementById("dedupToggle");

dedupToggle.addEventListener("change", () => {
    if (!selectedImage) return;

    selectedImage.flipAwareDedup = dedupToggle.checked;

    renderImages();

    drawToCanvas(selectedImage);
});

function syncDedupUI() {
    if (!selectedImage) {
        dedupToggle.checked = false;
        return;
    }

    dedupToggle.checked = !!selectedImage.flipAwareDedup;
}

function getFlippedTile(tile, flipX, flipY) {
    const size = 8;
    const flipped = [];

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {

            const srcX = flipX ? (size - 1 - x) : x;
            const srcY = flipY ? (size - 1 - y) : y;

            const i = (srcY * size + srcX) * 4;

            flipped.push(
                tile[i],
                tile[i + 1],
                tile[i + 2],
                tile[i + 3]
            );
        }
    }

    return flipped;
}


// Handle Project Creation
function createProjectData() {
    return {
        name: projectTitle.textContent,
        selectedImageId: selectedImage?.id ?? null,
        images
    };
}

// Handle New Project
const newBtn = document.getElementById("newBtn");

newBtn.addEventListener("click", () => {

    if (!confirm("Create a new project?")) {
        return;
    }

    images.length = 0;

    selectedImage = null;

    uniqueTiles = [];
    tileMap.clear();

    projectTitle.textContent = "Untitled Project";

    imageList.innerHTML = "";
    document.getElementById("tileGrid").innerHTML = "";

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updateSidebar(0, 0);

    uploadInput.value = "";
    syncCopyImageUI();
});

// Handle Save Project
const saveBtn = document.getElementById("saveBtn");

saveBtn.addEventListener("click", saveProject);
async function saveProject() {
    const project = createProjectData();

    const blob = new Blob(
        [JSON.stringify(project, null, 2)],
        { type: "application/json" }
    );

    if ("showSaveFilePicker" in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: `${project.name}.tilegb`,
                types: [{
                    description: "TileGB Project",
                    accept: {
                        "application/json": [".tilegb"]
                    }
                }]
            });

            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();

            showToast("Project saved!");
            return;
        } catch (err) {
            if (err.name === "AbortError") return;
        }
    }

    // Fallback for unsupported browsers
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}.tilegb`;
    a.click();

    URL.revokeObjectURL(url);
}

// Handle Load Project
const loadBtn = document.getElementById("loadBtn");
const projectLoader = document.getElementById("projectLoader");

loadBtn.addEventListener("click", () => {
    projectLoader.click();
});
projectLoader.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const project = JSON.parse(text);

    projectTitle.textContent = project.name;

    images.length = 0;
    images.push(...project.images);

    selectedImage = images.find(
        img => img.id === project.selectedImageId
    ) ?? null;

    renderImages();

    if (selectedImage) {
        drawToCanvas(selectedImage);
        syncDedupUI();
    }
    syncCopyImageUI();

    projectLoader.value = "";
});

// Handle Saving Images
function fileToDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = () => {
            resolve(reader.result);
        };

        reader.readAsDataURL(file);
    });
}


// Handle Copy Image
function buildCopyImage() {
    const tileSize = 8;
    const tilesPerRow = 16;

    const tiles = uniqueTiles;
    const rows = Math.ceil(tiles.length / tilesPerRow);

    const canvas = document.createElement("canvas");

    canvas.width = tilesPerRow * tileSize;
    canvas.height = rows * tileSize;

    const ctx = canvas.getContext("2d");

    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];

        const x = (i % tilesPerRow) * tileSize;
        const y = Math.floor(i / tilesPerRow) * tileSize;

        const imgData = ctx.createImageData(8, 8);
        const data = imgData.data;

        for (let p = 0; p < tile.length; p += 4) {
            const alpha = tile[p + 3];

            if (alpha === 0) {
                // treat transparent as white
                data[p] = 255;
                data[p + 1] = 255;
                data[p + 2] = 255;
                data[p + 3] = 255;
            } else {
                data[p] = tile[p];
                data[p + 1] = tile[p + 1];
                data[p + 2] = tile[p + 2];
                data[p + 3] = 255; // force opaque
            }
        }

        ctx.putImageData(imgData, x, y);
    }

    return canvas;
}

function updateCopyImage() {
    const container = document.getElementById("copyImage");
    const btn = document.getElementById("copyImageBtn");

    container.innerHTML = "";

    if (!uniqueTiles.length) {
        btn.disabled = true;
        return;
    }

    btn.disabled = false;

    const canvas = buildCopyImage();

    canvas.style.width = "512px";
    canvas.style.height = "auto";
    canvas.style.imageRendering = "pixelated";

    container.appendChild(canvas);
}

const copyImageBtn = document.getElementById("copyImageBtn");

copyImageBtn.addEventListener("click", async () => {
    const canvas = buildCopyImage();

    canvas.toBlob(async (blob) => {
        if (!blob) return;

        try {
            await navigator.clipboard.write([
                new ClipboardItem({ "image/png": blob })
            ]);

            showToast("Copied image to clipboard!");
        } catch (err) {
            showToast("Copy failed");
        }
    });
});

function syncCopyImageUI() {
    const btn = document.getElementById("copyImageBtn");
    const container = document.getElementById("copyImage");

    const hasImage = !!selectedImage;

    btn.style.display = hasImage ? "block" : "none";
    container.style.display = hasImage ? "block" : "none";
}

// Handle Toast
const toast = document.getElementById("toast");

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toast._t);

    toast._t = setTimeout(() => {
        toast.classList.remove("show");
    }, 1200);
}


// Handle Help

const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");

helpBtn.addEventListener("click", () => {
    helpModal.style.display = "flex";
});

closeHelp.addEventListener("click", () => {
    helpModal.style.display = "none";
});

helpModal.addEventListener("click", (e) => {
    if (e.target === helpModal) {
        helpModal.style.display = "none";
    }
});
