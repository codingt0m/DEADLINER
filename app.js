import { db, auth, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, query, orderBy, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from './firebase.js';
console.log("🚀 Firebase imported successfully");

// --- CONFIG ---
const COLORS_CONFIG = {
    'blue': 'text-blue-600',
    'red': 'text-red-600',
    'green': 'text-green-600',
    'purple': 'text-purple-600',
    'yellow': 'text-yellow-600'
};

const FOLDER_COLORS = {
    'blue': 'bg-blue-100 text-blue-700',
    'red': 'bg-red-100 text-red-700',
    'green': 'bg-green-100 text-green-700',
    'purple': 'bg-purple-100 text-purple-700',
    'gray': 'bg-gray-100 text-gray-700',
    'yellow': 'bg-yellow-100 text-yellow-700'
};

const FOLDER_ICON_COLORS = {
    'blue': 'text-blue-400',
    'red': 'text-red-400',
    'green': 'text-green-400',
    'purple': 'text-purple-400',
    'gray': 'text-gray-400',
    'yellow': 'text-yellow-400'
};

// --- HELPERS GLOBAUX ---
const hexToRgba = (hex, alpha) => {
    let r = 0, g = 0, b = 0;
    if (hex.startsWith('#')) hex = hex.slice(1);
    if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    }
    return `rgba(${r},${g},${b},${alpha})`;
};

const vibrate = (ms = 50) => {
    if (navigator.vibrate) navigator.vibrate(ms);
};

const getEmailFromPseudo = (pseudo) => {
    const cleanPseudo = pseudo.trim().toLowerCase().replace(/\s+/g, '');
    return `${cleanPseudo}@deadliner.app`;
};

// --- STORE ---
class Store {
    constructor() {
        this.user = null;
        this.tasks = [];
        this.deadlines = [];
        this.folders = [];
        this.tags = [];
        this.currentDate = new Date();
    }

    col(name) { 
        if(!this.user) return null;
        return collection(db, `users/${this.user.uid}/${name}`); 
    }

    async init(firebaseUser) {
        if (!firebaseUser) {
            this.user = null;
            return;
        }

        try {
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const userSnap = await getDoc(userDocRef);
            
            if (userSnap.exists()) {
                const data = userSnap.data();
                this.user = { 
                    uid: firebaseUser.uid, 
                    name: data.name || "Utilisateur", 
                    color: data.color || 'blue' 
                };
            } else {
                this.user = { uid: firebaseUser.uid, name: "Nouveau", color: 'blue' };
            }
            await this.refresh();
        } catch (e) {
            console.error("Erreur init user:", e);
        }
    }

    async updateProfile(newName, newColor) {
        if (!this.user) return;
        try {
            await setDoc(doc(db, 'users', this.user.uid), { name: newName, color: newColor }, { merge: true });
            this.user.name = newName;
            this.user.color = newColor;
            return true;
        } catch (e) { return false; }
    }

    async refresh() {
        if (!this.user) return;
        try {
            const [dlSnap, tkSnap, foSnap, tgSnap] = await Promise.all([
                getDocs(query(this.col('deadlines'))),
                getDocs(query(this.col('tasks'))),
                getDocs(query(this.col('folders'))),
                getDocs(query(this.col('tags')))
            ]);
            this.deadlines = dlSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(a.date) - new Date(b.date));
            this.tasks = tkSnap.docs.map(t => ({ id: t.id, ...t.data() }));
            this.folders = foSnap.docs.map(f => ({ id: f.id, ...f.data() }));
            this.tags = tgSnap.docs.map(t => ({ id: t.id, ...t.data() }));
        } catch (e) { console.error("Erreur chargement:", e); }
    }

    getTasksForDeadline(dlId) { return this.tasks.filter(t => t.deadlineId === dlId); }
    getOrphanTasks() { return this.tasks.filter(t => !t.deadlineId); }
    getFolder(id) { return this.folders.find(f => f.id === id); }
    getTag(id) { return this.tags.find(t => t.id === id); }

    async addDeadline(data) { await addDoc(this.col("deadlines"), data); await this.refresh(); }
    
    async addTask(data) {
        const task = {
            title: data.title,
            type: data.taskType || 'CLASSIC',
            done: false,
            current: 0,
            target: parseInt(data.target) || 0,
            deadlineId: data.deadlineId || null,
            folderId: data.folderId || null,
            tagId: data.tagId || null,
            date: data.taskDate || null,
            description: data.description || '',
            duration: parseInt(data.duration) || 0,
            createdAt: new Date().toISOString()
        };
        await addDoc(this.col("tasks"), task);
        await this.refresh();
    }
    
    async addFolder(name, color = 'gray') { 
        await addDoc(this.col("folders"), { name, color, createdAt: new Date().toISOString() }); 
        await this.refresh(); 
    }
    
    async addTag(name) { await addDoc(this.col("tags"), { name, color: 'blue', createdAt: new Date().toISOString() }); await this.refresh(); }

    async toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if(!task) return;
        task.done = !task.done;
        if(task.done) vibrate(100); 
        else vibrate(50);
        await updateDoc(doc(db, `users/${this.user.uid}/tasks`, id), { done: task.done });
        return task.done;
    }

    async updateGradual(id, delta) {
        const task = this.tasks.find(t => t.id === id);
        if(!task) return;
        let newVal = Math.min(Math.max(task.current + delta, 0), task.target);
        if(newVal !== task.current) vibrate(30);
        task.current = newVal;
        await updateDoc(doc(db, `users/${this.user.uid}/tasks`, id), { current: newVal });
        return task;
    }

    async deleteItem(collectionName, id) {
        vibrate(50);
        if(confirm("Supprimer cet élément ?")) {
            await deleteDoc(doc(db, `users/${this.user.uid}/${collectionName}`, id));
            await this.refresh();
            return true;
        }
        return false;
    }
    
    async deleteItemDirect(collectionName, id) {
        await deleteDoc(doc(db, `users/${this.user.uid}/${collectionName}`, id));
        await this.refresh();
        return true;
    }
}

// --- UI MANAGER ---
class UI {
    constructor(store) {
        this.store = store;
        this.currentView = 'view-list';
        this.searchTerm = '';
        this.activeFilter = 'all'; 
        this.els = {
            list: document.getElementById('view-list'),
            calendar: document.getElementById('view-calendar'),
            projects: document.getElementById('view-projects'),
            filters: document.getElementById('filters-container'),
            calGrid: document.getElementById('calendar-grid'),
            calTitle: document.getElementById('calendar-title'),
            authContainer: document.getElementById('auth-container'),
            mainContent: document.getElementById('main-content'),
            header: document.getElementById('app-header'),
            nav: document.getElementById('app-nav'),
            fab: document.getElementById('fab-add'),
            projectGrid: document.getElementById('projects-grid'),
            tagsList: document.getElementById('tags-list'),
            currentProfileName: document.getElementById('current-profile-name'),
            profileBtn: document.getElementById('btn-edit-profile')
        };
    }

    showLogin() {
        this.els.authContainer.classList.remove('hidden');
        this.els.mainContent.classList.add('hidden');
        this.els.header.classList.add('hidden');
        this.els.nav.classList.add('hidden');
        this.els.fab.classList.add('hidden');
        this.els.filters.classList.add('hidden');
        
        // Reset inputs
        document.getElementById('auth-pseudo').value = '';
        document.getElementById('auth-error').classList.add('hidden');
    }

    showApp() {
        this.els.authContainer.classList.add('hidden');
        this.els.mainContent.classList.remove('hidden');
        this.els.header.classList.remove('hidden');
        this.els.nav.classList.remove('hidden');
        this.els.fab.classList.remove('hidden');
        this.els.filters.classList.remove('hidden');
        this.updateProfileDisplay();
        this.render();
    }

    updateProfileDisplay() {
        if (!this.store.user) return;
        this.els.currentProfileName.innerText = this.store.user.name;
        const btn = this.els.profileBtn;
        const color = this.store.user.color;
        btn.style = '';
        btn.className = `flex items-center gap-2 px-2 py-1 rounded transition-colors group`;
        if (color.startsWith('#')) {
            btn.style.backgroundColor = hexToRgba(color, 0.15);
            btn.style.color = color;
            const icon = btn.querySelector('i');
            if(icon) icon.className = "ph ph-pencil-simple text-xs opacity-50 group-hover:opacity-100";
        } else {
            const colorMap = {
                'blue': 'text-blue-600 bg-blue-100',
                'purple': 'text-purple-600 bg-purple-100',
                'green': 'text-green-600 bg-green-100',
                'red': 'text-red-600 bg-red-100',
                'yellow': 'text-yellow-600 bg-yellow-100',
            };
            const classes = colorMap[color] || colorMap['blue'];
            btn.classList.add(...classes.split(' '));
            const icon = btn.querySelector('i');
            if(icon) icon.className = "ph ph-pencil-simple text-gray-400 group-hover:text-brand text-xs";
        }
    }

    render() {
        this.renderFilters();
        if(this.currentView === 'view-list') this.renderListView();
        else if(this.currentView === 'view-calendar') this.renderCalendarView();
        else if(this.currentView === 'view-projects') this.renderProjectsView();
    }

    renderFilters() {
        let html = `<button class="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${this.activeFilter === 'all' ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}" data-filter="all">Tout</button>`;
        this.store.folders.forEach(f => {
            const isActive = this.activeFilter === f.id;
            const cls = isActive ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600';
            html += `<button class="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${cls}" data-filter="${f.id}">${f.name}</button>`;
        });
        this.els.filters.innerHTML = html;
        this.els.filters.querySelectorAll('button').forEach(btn => {
            btn.onclick = () => { this.activeFilter = btn.dataset.filter; this.render(); };
        });
    }

    renderListView() {
        this.els.list.innerHTML = '';
        const matchFilter = (t) => {
            const matchSearch = t.title.toLowerCase().includes(this.searchTerm.toLowerCase());
            const matchFolder = this.activeFilter === 'all' || t.folderId === this.activeFilter;
            return matchSearch && matchFolder;
        };

        this.store.deadlines.forEach(dl => {
            const tasks = this.store.getTasksForDeadline(dl.id).filter(matchFilter);
            if(tasks.length === 0 && !dl.title.toLowerCase().includes(this.searchTerm.toLowerCase())) return;
            const daysLeft = Math.ceil((new Date(dl.date) - new Date()) / (1000 * 60 * 60 * 24));
            
            let titleStyle = '';
            let titleClass = 'text-lg font-bold';
            if (dl.color.startsWith('#')) titleStyle = `color: ${dl.color}`;
            else titleClass += ` ${COLORS_CONFIG[dl.color] || 'text-gray-800'}`;

            const div = document.createElement('div');
            div.className = 'card-anim mb-4';
            div.innerHTML = `
                <div class="flex items-baseline justify-between mb-2 border-b border-gray-100 pb-1 group">
                    <h2 class="${titleClass}" style="${titleStyle}">${dl.title}</h2>
                    <div class="flex items-center gap-2">
                         <span class="text-xs font-mono font-medium text-gray-400">${daysLeft}j</span>
                         <button class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" data-del-dl="${dl.id}"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
                <div class="space-y-3 task-container"></div>
            `;
            const container = div.querySelector('.task-container');
            tasks.forEach(t => container.appendChild(this.createTaskEl(t)));
            div.querySelector('[data-del-dl]').onclick = async () => { if(await this.store.deleteItem("deadlines", dl.id)) this.render(); };
            this.els.list.appendChild(div);
        });

        const orphanTasks = this.store.getOrphanTasks().filter(matchFilter);
        if(orphanTasks.length > 0) {
            const div = document.createElement('div');
            div.className = 'mt-6 pt-4 border-t-2 border-dashed border-gray-200';
            div.innerHTML = `<h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Autres tâches</h3><div class="space-y-3 task-container"></div>`;
            const container = div.querySelector('.task-container');
            orphanTasks.forEach(t => container.appendChild(this.createTaskEl(t)));
            this.els.list.appendChild(div);
        }
    }

    createTaskEl(task) {
        const container = document.createElement('div');
        container.className = 'relative overflow-hidden rounded-xl h-full select-none';

        const bgLayer = document.createElement('div');
        bgLayer.className = 'absolute inset-0 flex justify-between items-center px-4 z-0 text-white font-bold pointer-events-none';
        bgLayer.innerHTML = `
            <div class="flex items-center gap-2 opacity-0 transition-opacity duration-200" id="bg-complete"><i class="ph ph-check text-xl"></i></div>
            <div class="flex items-center gap-2 opacity-0 transition-opacity duration-200" id="bg-delete"><i class="ph ph-trash text-xl"></i></div>
        `;
        container.appendChild(bgLayer);

        const content = document.createElement('div');
        content.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative z-10 transition-transform duration-100 ease-out flex flex-col gap-2';
        
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        const THRESHOLD = 100;

        const resetSwipe = () => {
            content.style.transform = `translateX(0px)`;
            bgLayer.querySelector('#bg-complete').style.opacity = 0;
            bgLayer.querySelector('#bg-delete').style.opacity = 0;
            container.style.backgroundColor = 'transparent';
        };

        const handleStart = (e) => {
            startX = e.touches ? e.touches[0].clientX : e.clientX;
            isDragging = true;
            content.style.transition = 'none';
        };

        const handleMove = (e) => {
            if (!isDragging) return;
            const x = e.touches ? e.touches[0].clientX : e.clientX;
            const delta = x - startX;
            currentX = delta;

            if (delta > 150) currentX = 150 + (delta - 150) * 0.2;
            if (delta < -150) currentX = -150 + (delta + 150) * 0.2;

            content.style.transform = `translateX(${currentX}px)`;

            if (currentX > 0) {
                container.style.backgroundColor = '#10b981';
                bgLayer.querySelector('#bg-complete').style.opacity = Math.min(currentX / 80, 1);
                bgLayer.querySelector('#bg-delete').style.opacity = 0;
            } else {
                container.style.backgroundColor = '#ef4444';
                bgLayer.querySelector('#bg-delete').style.opacity = Math.min(Math.abs(currentX) / 80, 1);
                bgLayer.querySelector('#bg-complete').style.opacity = 0;
            }
        };

        const handleEnd = async () => {
            if (!isDragging) return;
            isDragging = false;
            content.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

            if (currentX > THRESHOLD) {
                content.style.transform = `translateX(100%)`;
                vibrate(100);
                setTimeout(async () => {
                    const newDone = await this.store.toggleTask(task.id);
                    if (newDone) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                    this.render();
                }, 200);
            } else if (currentX < -THRESHOLD) {
                content.style.transform = `translateX(-100%)`;
                vibrate(100);
                setTimeout(async () => {
                    await this.store.deleteItemDirect("tasks", task.id);
                    this.render();
                }, 200);
            } else {
                resetSwipe();
            }
        };

        content.addEventListener('touchstart', handleStart, {passive: true});
        content.addEventListener('touchmove', handleMove, {passive: true});
        content.addEventListener('touchend', handleEnd);
        content.addEventListener('mousedown', handleStart);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', (e) => { if(isDragging) handleEnd(); });

        const delBtn = document.createElement('button');
        delBtn.className = 'absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block';
        delBtn.innerHTML = '<i class="ph ph-trash"></i>';
        delBtn.onclick = async (e) => { e.stopPropagation(); if(await this.store.deleteItem("tasks", task.id)) this.render(); };
        content.appendChild(delBtn);

        let metaHtml = '';
        if(task.tagId) {
            const tag = this.store.getTag(task.tagId);
            if(tag) metaHtml += `<span class="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 mr-1">#${tag.name}</span>`;
        }
        if(task.folderId) {
            const folder = this.store.getFolder(task.folderId);
            if(folder) {
                const badgeColorClass = FOLDER_COLORS[folder.color] || 'bg-gray-100 text-gray-600';
                metaHtml += `<span class="text-[9px] px-1.5 py-0.5 rounded ${badgeColorClass}">📁 ${folder.name}</span>`;
            }
        }
        if(task.duration > 0) {
             metaHtml += `<span class="text-[9px] px-1.5 py-0.5 rounded text-gray-400 ml-1">⏱️ ${task.duration}min</span>`;
        }
        if(task.date) {
            const dateObj = new Date(task.date);
            const dateStr = dateObj.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'});
            metaHtml += `<span class="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 ml-1">📅 ${dateStr}</span>`;
        }

        const metaDiv = metaHtml ? `<div class="mb-1">${metaHtml}</div>` : '';

        if(task.type === 'CLASSIC') {
            const inner = document.createElement('div');
            inner.className = 'flex items-start gap-3 pr-6';
            inner.innerHTML = `
                <div class="checkbox-wrapper relative cursor-pointer w-6 h-6 flex-shrink-0 mt-0.5 pointer-events-none">
                    <input type="checkbox" class="sr-only" ${task.done ? 'checked' : ''}>
                    <div class="w-6 h-6 border-2 border-gray-300 rounded-full flex items-center justify-center transition-colors">
                        <i class="ph ph-check text-white text-sm opacity-0 transform scale-50 transition-all duration-200 font-bold"></i>
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="${task.done ? 'text-gray-400 line-through' : 'text-gray-800'} text-sm font-medium transition-colors">${task.title}</p>
                    ${metaDiv}
                    ${task.description ? `<p class="text-xs text-gray-500 mt-1 line-clamp-2">${task.description}</p>` : ''}
                </div>
            `;
            content.appendChild(inner);
        } else {
            const ratio = (task.current / task.target) * 100;
            const inner = document.createElement('div');
            inner.className = 'w-full pr-4';
            inner.innerHTML = `
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm font-medium text-gray-800">${task.title}</span>
                    <span class="text-xs font-mono text-gray-500">${task.current}/${task.target}</span>
                </div>
                ${metaDiv}
                <div class="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-3 mt-2">
                    <div class="h-full bg-brand progress-bar" style="width: ${ratio}%"></div>
                </div>
                <div class="flex gap-3">
                    <button class="flex-1 py-1 bg-gray-100 rounded-lg text-gray-600 text-sm active:bg-gray-300 touch-manipulation" data-act="-1"><i class="ph ph-minus"></i></button>
                    <button class="flex-1 py-1 bg-black text-white rounded-lg text-sm active:opacity-80 touch-manipulation" data-act="1"><i class="ph ph-plus"></i></button>
                </div>
            `;
            inner.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('touchstart', (e) => e.stopPropagation(), {passive: true});
                btn.addEventListener('mousedown', (e) => e.stopPropagation());
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const taskUpdated = await this.store.updateGradual(task.id, parseInt(btn.dataset.act));
                    this.render();
                    if(taskUpdated.current === taskUpdated.target) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                };
            });
            content.appendChild(inner);
        }

        container.appendChild(content);
        return container;
    }

    renderCalendarView() {
        this.els.calGrid.innerHTML = '';
        const year = this.store.currentDate.getFullYear();
        const month = this.store.currentDate.getMonth();
        this.els.calTitle.innerText = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(this.store.currentDate);
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        let startDay = firstDay.getDay() || 7; 
        for(let i=1; i<startDay; i++) this.els.calGrid.appendChild(document.createElement('div'));
        for(let d=1; d<=lastDay.getDate(); d++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isToday = new Date().toISOString().split('T')[0] === dateStr;
            const cell = document.createElement('div');
            cell.className = `calendar-day flex flex-col items-center ${isToday ? 'today' : ''}`;
            cell.innerHTML = `<span class="text-[10px] font-bold text-gray-500 mb-1">${d}</span>`;
            this.store.deadlines.filter(dl => dl.date === dateStr).forEach(dl => {
                const dot = document.createElement('div');
                if (dl.color.startsWith('#')) {
                    dot.className = `w-full text-[9px] truncate px-1 rounded mb-0.5`;
                    dot.style.backgroundColor = hexToRgba(dl.color, 0.15);
                    dot.style.color = dl.color;
                } else {
                    const colorMap = {
                        'blue': 'bg-blue-100 text-blue-700',
                        'red': 'bg-red-100 text-red-700',
                        'green': 'bg-green-100 text-green-700',
                        'purple': 'bg-purple-100 text-purple-700',
                        'yellow': 'bg-yellow-100 text-yellow-700'
                    };
                    dot.className = `w-full text-[9px] truncate px-1 rounded mb-0.5 ${colorMap[dl.color] || 'bg-gray-100 text-gray-700'}`;
                }
                dot.innerText = dl.title;
                cell.appendChild(dot);
            });
            this.store.tasks.filter(t => t.date === dateStr && !t.done).forEach(t => {
                const dot = document.createElement('div');
                dot.className = `w-full text-[9px] truncate px-1 rounded mb-0.5 bg-gray-100 text-gray-700 border border-gray-200`;
                dot.innerText = t.title;
                cell.appendChild(dot);
            });
            this.els.calGrid.appendChild(cell);
        }
    }

    renderProjectsView() {
        this.els.projectGrid.innerHTML = '';
        this.store.folders.forEach(f => {
            const el = document.createElement('div');
            el.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center justify-center relative group aspect-square hover:bg-gray-50 transition-colors cursor-pointer';
            
            // Modification: Utilisation de la couleur du dossier pour l'icône
            const colorClass = FOLDER_ICON_COLORS[f.color] || 'text-yellow-400';
            
            el.innerHTML = `
                <i class="ph ph-folder-simple text-4xl ${colorClass} mb-2"></i>
                <span class="font-medium text-sm text-center truncate w-full">${f.name}</span>
                <button class="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100" data-del><i class="ph ph-trash"></i></button>
            `;
            el.querySelector('[data-del]').onclick = (e) => { e.stopPropagation(); this.store.deleteItem('folders', f.id).then(() => this.render()); };
            el.onclick = () => {
                this.activeFilter = f.id;
                document.querySelector('[data-target="view-list"]').click(); 
            };
            this.els.projectGrid.appendChild(el);
        });
        this.els.tagsList.innerHTML = '';
        this.store.tags.forEach(t => {
            const el = document.createElement('span');
            el.className = 'px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium flex items-center gap-1 group';
            el.innerHTML = `#${t.name} <button class="text-gray-300 hover:text-red-500 w-0 overflow-hidden group-hover:w-auto transition-all" data-del><i class="ph ph-x"></i></button>`;
            el.querySelector('[data-del]').onclick = () => this.store.deleteItem('tags', t.id).then(() => this.render());
            this.els.tagsList.appendChild(el);
        });
    }
}

const main = async () => {
    const store = new Store();
    const ui = new UI(store);
    
    // GESTION AUTHENTIFICATION (LOGIN/REGISTER)
    const errorMsg = document.getElementById('auth-error');
    
    // Switch between modes handled by checking which button submitted, or just buttons actions
    const btnLogin = document.getElementById('btn-login');
    const btnRegister = document.getElementById('btn-register');

    // PIN KEYPAD LOGIC
    let currentPin = '';

    const updatePinVisuals = () => {
        const dots = document.querySelectorAll('#pin-dots div');
        dots.forEach((dot, index) => {
            if (index < currentPin.length) {
                dot.className = "w-4 h-4 rounded-full bg-black transition-colors transform scale-110";
            } else {
                dot.className = "w-4 h-4 rounded-full bg-gray-200 transition-colors";
            }
        });
    };

    document.querySelectorAll('.keypad-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            if(currentPin.length < 6) {
                currentPin += btn.dataset.val;
                vibrate(20);
                updatePinVisuals();
            }
        };
    });

    const btnDeletePin = document.getElementById('btn-delete-pin');
    if(btnDeletePin) {
        btnDeletePin.onclick = (e) => {
            e.preventDefault();
            if(currentPin.length > 0) {
                currentPin = currentPin.slice(0, -1);
                vibrate(20);
                updatePinVisuals();
            }
        };
    }

    const handleAuth = async () => {
        const pseudoInput = document.getElementById('auth-pseudo');
        const pseudo = pseudoInput.value.trim();
        const pin = currentPin;
        
        errorMsg.classList.add('hidden');

        if(pseudo.length < 2 || pin.length < 6) {
            errorMsg.innerText = "Pseudo (2+ chars) et PIN complet requis.";
            errorMsg.classList.remove('hidden');
            vibrate(100);
            return;
        }

        const email = getEmailFromPseudo(pseudo);

        try {
            if (isRegisterMode) {
                const cred = await createUserWithEmailAndPassword(auth, email, pin);
                await store.init(cred.user);
                await store.updateProfile(pseudo, 'blue'); 
            } else {
                await signInWithEmailAndPassword(auth, email, pin);
            }
        } catch (error) {
            console.error(error);
            let msg = "Erreur inconnue.";
            if(error.code === 'auth/wrong-password') msg = "Code PIN incorrect.";
            if(error.code === 'auth/user-not-found') msg = "Compte introuvable.";
            if(error.code === 'auth/email-already-in-use') msg = "Ce pseudo est déjà pris.";
            if(error.code === 'auth/weak-password') msg = "Le code doit faire 6 chiffres.";
            if(error.code === 'auth/invalid-email') msg = "Pseudo invalide.";
            errorMsg.innerText = msg;
            errorMsg.classList.remove('hidden');
            vibrate(100);
        }
    };

    // AUTH LOGIC with Toggle
    let isRegisterMode = false;
    const authTitle = document.getElementById('auth-sub-title');
    const btnAuthAction = document.getElementById('btn-auth-action');
    const btnSwitchAuth = document.getElementById('btn-switch-auth');
    const authSwitchLabel = document.getElementById('auth-switch-label');

    const updateAuthUI = () => {
        if (isRegisterMode) {
            authTitle.innerText = "Création de compte";
            btnAuthAction.innerText = "S'inscrire";
            authSwitchLabel.innerText = "Déjà un compte ?";
            btnSwitchAuth.innerText = "Se connecter";
        } else {
            authTitle.innerText = "Identification";
            btnAuthAction.innerText = "Se connecter";
            authSwitchLabel.innerText = "Vous n'avez pas encore de compte ?";
            btnSwitchAuth.innerText = "Créer";
        }
        errorMsg.classList.add('hidden');
    };

    btnSwitchAuth.onclick = (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        updateAuthUI();
    };

    // Submit handler unique
    document.getElementById('auth-form').onsubmit = (e) => {
        e.preventDefault();
        handleAuth();
    };

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) logoutBtn.onclick = () => signOut(auth);
    
    // Modification ICI : Logo -> Home (Liste des tâches)
    const headerLogo = document.getElementById('header-logo');
    if(headerLogo) {
        headerLogo.onclick = () => {
            // Rediriger vers la vue liste via le bouton de navigation
            const listBtn = document.querySelector('.nav-btn[data-target="view-list"]');
            if(listBtn) listBtn.click();
        };
    }

    // AUTH STATE LISTENER
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("Utilisateur connecté:", user.email);
            await store.init(user);
            ui.showApp();
            currentPin = ''; 
            updatePinVisuals();
        } else {
            console.log("Utilisateur déconnecté");
            store.user = null;
            currentPin = '';
            updatePinVisuals();
            ui.showLogin();
        }
    });

    setupNav(ui);
    setupModal(store, ui);
    setupProjects(store, ui);
    setupProfileModal(store, ui);

    console.log("✅ Application initialisée");
};

const setupNav = (ui) => {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.replace('text-brand', 'text-gray-400'));
            btn.classList.replace('text-gray-400', 'text-brand');
            ['view-list', 'view-calendar', 'view-projects'].forEach(v => document.getElementById(v).classList.add('hidden'));
            const target = btn.dataset.target;
            document.getElementById(target).classList.remove('hidden');
            ui.currentView = target;
            ui.render();
        });
    });
    const searchInput = document.getElementById('search-input');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => { ui.searchTerm = e.target.value; ui.render(); });
    }
    const prevMonth = document.getElementById('prev-month');
    if(prevMonth) prevMonth.onclick = () => { ui.store.currentDate.setMonth(ui.store.currentDate.getMonth()-1); ui.render(); };
    const nextMonth = document.getElementById('next-month');
    if(nextMonth) nextMonth.onclick = () => { ui.store.currentDate.setMonth(ui.store.currentDate.getMonth()+1); ui.render(); };
};

const setupProfileModal = (store, ui) => {
    const modal = document.getElementById('modal-profile');
    const content = document.getElementById('modal-profile-content');
    const closeBtn = document.getElementById('modal-profile-close');
    const btnEdit = document.getElementById('btn-edit-profile');
    const form = document.getElementById('profile-form');
    const colorPicker = document.getElementById('custom-color-picker');
    const colorHex = document.getElementById('custom-color-hex');
    const radioCustom = document.getElementById('radio-custom');

    if(!modal) return;

    colorPicker.addEventListener('input', (e) => {
        colorHex.value = e.target.value;
        radioCustom.checked = true;
    });
    colorHex.addEventListener('input', (e) => {
        const val = e.target.value;
        if(val.startsWith('#') && val.length === 7) {
            colorPicker.value = val;
            radioCustom.checked = true;
        }
    });

    const open = () => {
        document.getElementById('profile-name-input').value = store.user.name;
        const currentColor = store.user.color;
        if(currentColor.startsWith('#')) {
            radioCustom.checked = true;
            colorPicker.value = currentColor;
            colorHex.value = currentColor;
        } else {
            const radio = form.querySelector(`input[value="${currentColor}"]`);
            if(radio) radio.checked = true;
            colorHex.value = '';
        }
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.replace('scale-95', 'scale-100');
        }, 10);
    };

    const close = () => {
        modal.classList.add('opacity-0');
        content.classList.replace('scale-100', 'scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    };

    btnEdit.onclick = open;
    closeBtn.onclick = close;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const name = formData.get('profileName');
        let color = formData.get('profileColor') || 'blue';
        if(color === 'custom') {
            const hexVal = colorHex.value;
            if(hexVal.startsWith('#') && (hexVal.length === 4 || hexVal.length === 7)) color = hexVal;
            else color = colorPicker.value;
        }
        if(name) {
            await store.updateProfile(name, color);
            ui.updateProfileDisplay();
            close();
        }
    };
};

const setupModal = (store, ui) => {
    const els = {
        fab: document.getElementById('fab-add'),
        overlay: document.getElementById('modal-overlay'),
        close: document.getElementById('modal-close'),
        form: document.getElementById('add-form'),
        tabTask: document.getElementById('tab-task'),
        tabDl: document.getElementById('tab-deadline'),
        fieldsTask: document.getElementById('fields-task'),
        fieldsDl: document.getElementById('fields-deadline'),
        dlSelect: document.getElementById('deadline-select'),
        folderSelect: document.getElementById('folder-select'),
        tagSelect: document.getElementById('tag-select'),
        typeSelect: document.getElementById('task-type-select'),
        targetField: document.getElementById('gradual-target-field'),
        dlColorPicker: document.getElementById('dl-custom-color-picker'),
        dlColorHex: document.getElementById('dl-custom-color-hex'),
        dlRadioCustom: document.getElementById('dl-radio-custom')
    };

    if(!els.fab) return;

    if(els.dlColorPicker) {
        els.dlColorPicker.addEventListener('input', (e) => {
            els.dlColorHex.value = e.target.value;
            els.dlRadioCustom.checked = true;
        });
        els.dlColorHex.addEventListener('input', (e) => {
            const val = e.target.value;
            if(val.startsWith('#') && val.length === 7) {
                els.dlColorPicker.value = val;
                els.dlRadioCustom.checked = true;
            }
        });
    }

    let mode = 'TASK';

    const open = () => {
        els.dlSelect.innerHTML = '<option value="">Aucune</option>' + store.deadlines.map(d => `<option value="${d.id}">${d.title}</option>`).join('');
        els.folderSelect.innerHTML = '<option value="">Aucun</option>' + store.folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
        els.tagSelect.innerHTML = '<option value="">Aucun</option>' + store.tags.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        document.body.classList.add('modal-active');
        setTimeout(() => els.overlay.classList.remove('opacity-0'), 10);
    };

    const close = () => {
        els.overlay.classList.add('opacity-0');
        setTimeout(() => document.body.classList.remove('modal-active'), 300);
    };

    els.fab.onclick = open;
    els.close.onclick = close;

    const setMode = (m) => {
        mode = m;
        if(m === 'TASK') {
            els.tabTask.className = "flex-1 py-2 text-sm font-medium rounded-md bg-white shadow-sm transition-all text-black";
            els.tabDl.className = "flex-1 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 transition-all";
            els.fieldsTask.classList.remove('hidden');
            els.fieldsDl.classList.add('hidden');
        } else {
            els.tabDl.className = "flex-1 py-2 text-sm font-medium rounded-md bg-white shadow-sm transition-all text-black";
            els.tabTask.className = "flex-1 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 transition-all";
            els.fieldsTask.classList.add('hidden');
            els.fieldsDl.classList.remove('hidden');
        }
    };
    els.tabTask.onclick = (e) => { e.preventDefault(); setMode('TASK'); };
    els.tabDl.onclick = (e) => { e.preventDefault(); setMode('DEADLINE'); };

    els.typeSelect.onchange = (e) => {
        if(e.target.value === 'GRADUAL') els.targetField.classList.remove('hidden');
        else els.targetField.classList.add('hidden');
    };

    els.form.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(els.form);
        const data = Object.fromEntries(formData.entries());
        if(mode === 'DEADLINE') {
            if(data.color === 'custom') {
                const hexVal = els.dlColorHex.value;
                if(hexVal.startsWith('#') && (hexVal.length === 4 || hexVal.length === 7)) data.color = hexVal;
                else data.color = els.dlColorPicker.value;
            }
            await store.addDeadline(data);
        } else {
            await store.addTask(data);
        }
        els.form.reset();
        close();
        ui.render();
    };
};

const setupProjects = (store, ui) => {
    const btnFolder = document.getElementById('btn-create-folder');
    if(btnFolder) {
        btnFolder.onclick = async () => {
            const input = document.getElementById('new-folder-name');
            // Récupération de la couleur choisie
            const colorInput = document.querySelector('input[name="folderColor"]:checked');
            const color = colorInput ? colorInput.value : 'gray';

            if(input.value.trim()) {
                await store.addFolder(input.value.trim(), color);
                input.value = '';
                ui.render();
            }
        };
    }
    const btnTag = document.getElementById('btn-create-tag');
    if(btnTag) {
        btnTag.onclick = async () => {
            const input = document.getElementById('new-tag-name');
            if(input.value.trim()) {
                await store.addTag(input.value.trim());
                input.value = '';
                ui.render();
            }
        };
    }
};

main();