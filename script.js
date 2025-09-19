// --- State ---
const state = {
    rows: [],
    edited: 0
};

const tbody = document.getElementById('tbody');
const editedDot = document.getElementById('editedDot');
const editedCount = document.getElementById('editedCount');

function uid() {
    return Math.random().toString(36).slice(2, 9)
}

function updateEditedBadge() {
    const n = state.rows.filter(r => r._dirty).length;
    editedCount.textContent = n;
    editedDot.classList.toggle('edited', n > 0);
}

function makeCell(text, editable = true) {
    const td = document.createElement('td');
    td.textContent = text ?? '';
    if (editable) {
        td.contentEditable = true;
        td.addEventListener('input', () => markRowDirty(td.closest('tr').dataset.id));
    }
    return td;
}

function markRowDirty(id) {
    const row = state.rows.find(r => r.id === id);
    if (row) {
        row._dirty = true;
        updateEditedBadge();
        renderRow(id);
    }
}

function renderRow(id) {
    const row = state.rows.find(r => r.id === id);
    const tr = tbody.querySelector(`tr[data-id="${id}"]`);
    if (!row || !tr) return;
    tr.querySelector('[data-k="title"]').textContent = row.title || '';
    tr.querySelector('[data-k="artist"]').textContent = row.artist || '';
    tr.querySelector('[data-k="album"]').textContent = row.album || '';
    tr.querySelector('[data-k="track"]').textContent = row.track || '';
    tr.querySelector('[data-k="year"]').textContent = row.year || '';
    tr.querySelector('[data-k="genre"]').textContent = row.genre || '';
    tr.querySelector('[data-k="comment"]').textContent = row.comment || '';
    const dot = tr.querySelector('[data-k="dot"]');
    dot.classList.toggle('edited', !!row._dirty);
    const art = tr.querySelector('img.art');
    if (row.pictureUrl) art.src = row.pictureUrl;
}

function addRowsFromFiles(fileList) {
    const files = Array.from(fileList || []);
    files.forEach(async (file) => {
        if (!file.type.startsWith('audio') && !/\.(mp3|flac|m4a|ogg|wav)$/i.test(file.name)) return;
        const id = uid();
        const arrayBuffer = await file.arrayBuffer();
        // parse metadata
        let meta = {
            common: {},
            format: {}
        };
        try {
            meta = await musicMetadata.parseBlob(new Blob([arrayBuffer]));
        } catch (e) {
            console.warn('Metadata parse failed', e);
        }

        const pict = (meta.common.picture && meta.common.picture[0]) ? meta.common.picture[0] : null;
        const pictureUrl = pict ? URL.createObjectURL(new Blob([pict.data], {
            type: pict.format || 'image/jpeg'
        })) : '';

        const row = {
            id,
            file,
            arrayBuffer,
            ext: file.name.split('.').pop().toLowerCase(),
            title: meta.common.title || '',
            artist: (meta.common.artists && meta.common.artists.join(', ')) || meta.common.artist || '',
            album: meta.common.album || '',
            track: (meta.common.track && meta.common.track.no) || '',
            year: meta.common.year || '',
            genre: (meta.common.genre && meta.common.genre[0]) || '',
            comment: (meta.common.comment && meta.common.comment[0]) || '',
            picture: pict || null,
            pictureUrl,
            _dirty: false,
            _selected: false,
        };
        state.rows.push(row);
        // build table row
        const tr = document.createElement('tr');
        tr.dataset.id = id;
        const td0 = document.createElement('td');
        td0.innerHTML = `<label class="rowcheck"><input type="checkbox" data-sel /> <span class="status-dot" data-k="dot"></span></label>`;
        tr.appendChild(td0);
        const tdArt = document.createElement('td');
        tdArt.innerHTML = `<img class="art" alt="" src="${pictureUrl}"/>`;
        tr.appendChild(tdArt);
        tr.appendChild(makeCell(file.name, false));
        const tdTitle = makeCell(row.title);
        tdTitle.dataset.k = 'title';
        tr.appendChild(tdTitle);
        const tdArtist = makeCell(row.artist);
        tdArtist.dataset.k = 'artist';
        tr.appendChild(tdArtist);
        const tdAlbum = makeCell(row.album);
        tdAlbum.dataset.k = 'album';
        tr.appendChild(tdAlbum);
        const tdTrack = makeCell(row.track);
        tdTrack.dataset.k = 'track';
        tr.appendChild(tdTrack);
        const tdYear = makeCell(row.year);
        tdYear.dataset.k = 'year';
        tr.appendChild(tdYear);
        const tdGenre = makeCell(row.genre);
        tdGenre.dataset.k = 'genre';
        tr.appendChild(tdGenre);
        const tdComment = makeCell(row.comment);
        tdComment.dataset.k = 'comment';
        tr.appendChild(tdComment);
        tbody.appendChild(tr);

        // Inline edit handling
        tr.addEventListener('input', (e) => {
            const k = e.target.dataset.k;
            if (!k) return;
            row[k] = e.target.textContent;
            markRowDirty(id);
        });

        // selection checkbox
        td0.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
            row._selected = e.target.checked;
        });

        // Double click art cell to set cover for one file
        tdArt.addEventListener('dblclick', async () => {
            const imgFile = await pickImage();
            if (imgFile) {
                await setRowArt(row, imgFile);
            }
        });
    });
}

async function pickImage() {
    return new Promise(resolve => {
        const i = document.createElement('input');
        i.type = 'file';
        i.accept = 'image/*';
        i.onchange = () => resolve(i.files[0]);
        i.click();
    });
}

async function setRowArt(row, imgFile) {
    const buf = await imgFile.arrayBuffer();
    row.picture = {
        data: new Uint8Array(buf),
        format: imgFile.type || 'image/jpeg'
    };
    if (row.pictureUrl) URL.revokeObjectURL(row.pictureUrl);
    row.pictureUrl = URL.createObjectURL(new Blob([row.picture.data], {
        type: row.picture.format
    }));
    row._dirty = true;
    updateEditedBadge();
    renderRow(row.id);
}

// Batch editor
document.getElementById('applyBatch').addEventListener('click', async () => {
    const fields = ['title', 'artist', 'album', 'track', 'year', 'genre', 'comment'];
    const vals = Object.fromEntries(fields.map(k => [k, document.getElementById('b_' + k).value]));
    const artFile = document.getElementById('b_art').files[0] || null;
    for (const row of state.rows.filter(r => r._selected)) {
        for (const k of fields) {
            if (vals[k] !== '' && vals[k] != null) {
                row[k] = vals[k];
                row._dirty = true;
            }
        }
        if (artFile) {
            await setRowArt(row, artFile);
        }
        renderRow(row.id);
    }
    updateEditedBadge();
});

// Import/Export CSV
function rowsToCsv() {
    const cols = ['filename', 'title', 'artist', 'album', 'track', 'year', 'genre', 'comment'];
    const header = cols.join(',');
    const lines = state.rows.map(r => {
        const vals = [r.file.name, r.title, r.artist, r.album, r.track, r.year, r.genre, r.comment];
        return vals.map(escapeCsv).join(',');
    });
    return [header, ...lines].join('\n');
}

function escapeCsv(v) {
    v = (v ?? '').toString();
    if (/[",\n]/.test(v)) {
        return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
}

function parseCsv(text) {
    // naive CSV parser adequate for typical cases
    const rows = [];
    let i = 0,
        cell = '',
        inQ = false,
        row = [];
    while (i < text.length) {
        const c = text[i++];
        if (inQ) {
            if (c === '"') {
                if (text[i] === '"') {
                    cell += '"';
                    i++;
                } else {
                    inQ = false;
                }
            } else {
                cell += c;
            }
        } else {
            if (c === '"') {
                inQ = true;
            } else if (c === ',') {
                row.push(cell);
                cell = '';
            } else if (c === '\n' || c === '\r') {
                if (cell !== '' || row.length) {
                    row.push(cell);
                    rows.push(row);
                    row = [];
                    cell = '';
                }
            } else {
                cell += c;
            }
        }
    }
    if (cell !== '' || row.length) {
        row.push(cell);
        rows.push(row);
    }
    const [header, ...data] = rows;
    const idx = Object.fromEntries(header.map((h, j) => [h.trim().toLowerCase(), j]));
    return data.filter(r => r.length).map(r => ({
        filename: r[idx.filename] || '',
        title: r[idx.title] || '',
        artist: r[idx.artist] || '',
        album: r[idx.album] || '',
        track: r[idx.track] || '',
        year: r[idx.year] || '',
        genre: r[idx.genre] || '',
        comment: r[idx.comment] || ''
    }));
}

document.getElementById('exportCsv').addEventListener('click', () => {
    const csv = rowsToCsv();
    const blob = new Blob([csv], {
        type: 'text/csv'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mintytag-export.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3500);
});

document.getElementById('importCsv').addEventListener('click', () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.csv,text/csv';
    i.onchange = async () => {
        const text = await i.files[0].text();
        const updates = parseCsv(text);
        updates.forEach(u => {
            const row = state.rows.find(r => r.file.name === u.filename);
            if (row) {
                Object.assign(row, Object.fromEntries(Object.entries(u).filter(([k, v]) => k !== 'filename' && v !== '')));
                row._dirty = true;
                renderRow(row.id);
            }
        });
        updateEditedBadge();
    };
    i.click();
});

// Save edited files (MP3 only)
document.getElementById('batchSave').addEventListener('click', async () => {
    const edited = state.rows.filter(r => r._dirty);
    if (!edited.length) return alert('Nothing to save. Make some edits first.');

    // Try File System Access API directory picker if available
    let dirHandle = null;
    try {
        if (window.showDirectoryPicker) {
            dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
        }
    } catch (e) {
        console.warn('Dir picker canceled or unsupported.', e);
    }

    for (const row of edited) {
        if (row.ext !== "mp3") {
            console.warn('Write skipped for non‑MP3:', row.file.name);
            continue;
        }
        const writer = new ID3Writer(row.arrayBuffer);
        if (row.title) writer.setFrame('TIT2', row.title);
        if (row.artist) writer.setFrame('TPE1', [row.artist]);
        if (row.album) writer.setFrame('TALB', row.album);
        if (row.track) writer.setFrame('TRCK', String(row.track));
        if (row.year) writer.setFrame('TDRC', String(row.year));
        if (row.genre) writer.setFrame('TCON', row.genre);
        if (row.comment) writer.setFrame('COMM', {
            description: '',
            text: row.comment
        });
        if (row.picture) {
            writer.setFrame('APIC', {
                type: 3,
                data: row.picture.data,
                description: 'Cover',
                mime: row.picture.format || 'image/jpeg'
            });
        }
        writer.addTag();
        const blob = writer.getBlob();
        const outName = row.file.name.replace(/\.mp3$/i, '') + ' — tagged.mp3';

        if (dirHandle) {
            try {
                const fileHandle = await dirHandle.getFileHandle(outName, {
                    create: true
                });
                const stream = await fileHandle.createWritable();
                await stream.write(blob);
                await stream.close();
            } catch (e) {
                console.warn('FS write failed, fallback to download', e);
                downloadBlob(blob, outName);
            }
        } else {
            downloadBlob(blob, outName);
        }
        row._dirty = false;
    }
    updateEditedBadge();
    alert('Done writing tags for MP3 files. Non‑MP3 were skipped (read‑only).');
});

function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3500);
}

// Folder picker to add many files
document.getElementById('openDir').addEventListener('click', async () => {
    if (!window.showDirectoryPicker) {
        return alert('Your browser does not support opening folders. Try Chrome or Edge.');
    }
    try {
        const dir = await window.showDirectoryPicker();
        for await (const entry of dir.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                if (/\.(mp3|flac|m4a|ogg|wav)$/i.test(file.name)) addRowsFromFiles([file]);
            }
        }
    } catch (e) {
        console.warn('Folder open canceled', e);
    }
});

// Dropzone & file input
document.getElementById('fileInput').addEventListener('change', (e) => addRowsFromFiles(e.target.files));
const drop = document.getElementById('dropzone');;
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
}));;
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
}));
drop.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    addRowsFromFiles(files);
});

// Clear
document.getElementById('clearAll').addEventListener('click', () => {
    state.rows.forEach(r => r.pictureUrl && URL.revokeObjectURL(r.pictureUrl));
    state.rows = [];
    tbody.innerHTML = '';
    updateEditedBadge();
});

// Sync contenteditable back to row when leaving a cell
tbody.addEventListener('focusout', (e) => {
    const td = e.target.closest('td[contenteditable]');
    if (!td) return;
    const tr = td.closest('tr');
    const id = tr.dataset.id;
    const k = td.dataset.k;
    const row = state.rows.find(r => r.id === id);
    if (row && k) {
        row[k] = td.textContent;
        row._dirty = true;
        updateEditedBadge();
    }
});