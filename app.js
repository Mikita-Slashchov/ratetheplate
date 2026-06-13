// --- ИМПОРТ МОДУЛЕЙ FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    query, 
    where, 
    onSnapshot, 
    doc, 
    deleteDoc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- ТВОЙ КОНФИГ Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyDrZZ_JxODAJZ0LmuRpm7bzLm_2Z7lpE4I",
  authDomain: "ratetheplateapp.firebaseapp.com",
  projectId: "ratetheplateapp",
  storageBucket: "ratetheplateapp.firebasestorage.app",
  messagingSenderId: "880336182426",
  appId: "1:880336182426:web:2152ebf528169bc206d323"
};

// Инициализация сервисов
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const foodCollection = collection(db, "foods");

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ПРИЛОЖЕНИЯ ---
let foodList = [];
let currentFilter = null; 
let currentUser = null; 
let unsubscribeSnapshot = null; 
let currentFormTags = []; 
let targetUserId = null; // ID пользователя, чей список мы сейчас смотрим

// --- ДОМ-ЭЛЕМЕНТЫ ---
const screenWelcome = document.getElementById('screen-welcome');
const appContent = document.getElementById('app-content');
const authNavLinks = document.getElementById('auth-nav-links');
const btnLogin = document.getElementById('btn-login');
const btnLoginWelcome = document.getElementById('btn-login-welcome');
const btnLogout = document.getElementById('btn-logout');

const screenForm = document.getElementById('screen-form');
const screenList = document.getElementById('screen-list');
const screenStats = document.getElementById('screen-stats');

const navFormBtn = document.getElementById('nav-form-btn');
const navListBtn = document.getElementById('nav-list-btn');
const navStatsBtn = document.getElementById('nav-stats-btn');

const foodForm = document.getElementById('food-form');
const editIdInput = document.getElementById('edit-food-id');
const submitBtn = document.getElementById('submit-btn');
const ratingInput = document.getElementById('rating');
const ratingValue = document.getElementById('rating-value');
const cardsContainer = document.getElementById('cards-container');
const statsContainer = document.getElementById('stats-container');
const topDishesContainer = document.getElementById('top-dishes-container');

const tagsContainer = document.getElementById('tags-container');
const tagInput = document.getElementById('tag-input');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');

// Элементы шеринга
const btnShareCatalog = document.getElementById('btn-share-catalog');
const shareModeBadge = document.getElementById('share-mode-badge');
const btnExitShare = document.getElementById('btn-exit-share');

// --- ЛОГИКА АВТОРИЗАЦИИ И ШЕРИНГА ---
async function login() {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Ошибка входа: ", error);
        alert("Не удалось войти через Google.");
    }
}

btnLogin.addEventListener('click', login);
btnLoginWelcome.addEventListener('click', login);
btnLogout.addEventListener('click', () => {
    signOut(auth).then(() => {
        // При выходе очищаем параметры просмотра, если они были
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.reload();
    });
});

// Проверка параметров ссылки на режим просмотра (view)
function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('view');
}

// Запуск слушателя базы данных Firestore для конкретного пользователя
function initFirebaseListener(userId) {
    if (unsubscribeSnapshot) unsubscribeSnapshot();

    const userQuery = query(foodCollection, where("userId", "==", userId));
    unsubscribeSnapshot = onSnapshot(userQuery, (snapshot) => {
        foodList = [];
        snapshot.forEach((doc) => {
            foodList.push({ id: doc.id, ...doc.data() });
        });
        if (!screenList.classList.contains('hidden')) renderCards();
        if (!screenStats.classList.contains('hidden')) renderStats();
    });
}

onAuthStateChanged(auth, (user) => {
    const viewParamId = checkUrlParams();

    if (viewParamId) {
        // --- РЕЖИМ ПРОСМОТРА ЧУЖОГО СПИСКА ---
        targetUserId = viewParamId;
        shareModeBadge.classList.remove('hidden');
        navFormBtn.classList.add('hidden'); // Скрываем вкладку добавления для гостя
        
        // Показываем интерфейс приложения (авторизация не обязательна для просмотра)
        screenWelcome.classList.add('hidden');
        appContent.classList.remove('hidden');
        
        if (user) {
            currentUser = user;
            btnLogin.classList.add('hidden');
            authNavLinks.classList.remove('hidden');
            btnLogout.classList.remove('hidden');
        } else {
            currentUser = null;
            btnLogin.classList.remove('hidden');
            authNavLinks.classList.add('hidden');
            btnLogout.classList.add('hidden');
        }

        switchScreen(screenList, navListBtn);
        initFirebaseListener(targetUserId);

    } else if (user) {
        // --- ОБЫЧНЫЙ РЕЖИМ (СВОЙ КАТАЛОГ) ---
        currentUser = user;
        targetUserId = user.uid;
        shareModeBadge.classList.add('hidden');
        navFormBtn.classList.remove('hidden');
        
        screenWelcome.classList.add('hidden');
        btnLogin.classList.add('hidden');
        appContent.classList.remove('hidden');
        authNavLinks.classList.remove('hidden');
        btnLogout.classList.remove('hidden');
        
        switchScreen(screenForm, navFormBtn);
        resetFormMode();
        initFirebaseListener(targetUserId);

    } else {
        // --- ПОЛЬЗОВАТЕЛЬ НЕ ВОШЕЛ И ССЫЛКИ НЕТ ---
        currentUser = null;
        targetUserId = null;
        foodList = [];
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        appContent.classList.add('hidden');
        authNavLinks.classList.add('hidden');
        btnLogout.classList.add('hidden');
        screenWelcome.classList.remove('hidden');
        btnLogin.classList.remove('hidden');
    }
});

// Кнопка выхода из режима просмотра в свой каталог
btnExitShare.addEventListener('click', () => {
    window.history.replaceState({}, document.title, window.location.pathname);
    window.location.reload();
});

// Кнопка «Поделиться списком»
btnShareCatalog.addEventListener('click', () => {
    if (!targetUserId) return;
    
    // Формируем уникальную ссылку на базе текущего ID каталога
    const shareUrl = `${window.location.origin}${window.location.pathname}?view=${targetUserId}`;
    
    // Копируем в буфер обмена телефона/ПК
    navigator.clipboard.writeText(shareUrl).then(() => {
        alert('Ссылка на ваш гастро-каталог успешно скопирована! Отправьте её друзьям 🍽️');
    }).catch(err => {
        console.error('Не удалось скопировать: ', err);
        alert(`Скопируйте эту ссылку вручную:\n${shareUrl}`);
    });
});

// --- НАВИГАЦИЯ ---
function switchScreen(activeScreen, activeBtn) {
    screenForm.classList.add('hidden');
    screenList.classList.add('hidden');
    screenStats.classList.add('hidden');
    navFormBtn.classList.remove('active');
    navListBtn.classList.remove('active');
    navStatsBtn.classList.remove('active');
    activeScreen.classList.remove('hidden');
    activeBtn.classList.add('active');
}

navFormBtn.addEventListener('click', () => {
    resetFormMode();
    switchScreen(screenForm, navFormBtn);
});
navStatsBtn.addEventListener('click', () => {
    switchScreen(screenStats, navStatsBtn);
    renderStats(); 
});
navListBtn.addEventListener('click', () => {
    switchScreen(screenList, navListBtn);
    currentFilter = null; 
    if (searchInput) searchInput.value = ''; 
    if (sortSelect) sortSelect.value = 'newest'; 
    renderCards(); 
});

// Слайдер оценки
ratingInput.addEventListener('input', (e) => {
    ratingValue.textContent = e.target.value;
});

function resetFormMode() {
    foodForm.reset();
    editIdInput.value = '';
    currentFormTags = []; 
    renderFormChips();    
    submitBtn.textContent = 'Сохранить в каталог';
    submitBtn.className = 'btn btn-brand w-100 py-2.5 fs-6';
    ratingValue.textContent = '5';
}

// --- ИНТЕРАКТИВНЫЕ ТЕГИ ---
function formatTagText(text) {
    const trimmed = text.trim();
    if (!trimmed) return "";
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// --- ОБНОВЛЕННЫЕ СЛУШАТЕЛИ ДЛЯ ТЕГОВ В APP.JS ---

function renderFormChips() {
    const chips = tagsContainer.querySelectorAll('.form-tag-chip');
    chips.forEach(chip => chip.remove());

    currentFormTags.forEach((tag, index) => {
        const chip = document.createElement('span');
        chip.className = 'form-tag-chip';
        chip.innerHTML = `<span>${tag}</span><button type="button" class="btn-close-tag" data-index="${index}">✕</button>`;
        
        chip.querySelector('.btn-close-tag').addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            currentFormTags.splice(idx, 1);
            renderFormChips();
        });

        chip.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-close-tag')) return;
            tagInput.value = tag;
            currentFormTags.splice(index, 1);
            renderFormChips();
            tagInput.focus();
        });

        tagsContainer.insertBefore(chip, tagInput);
    });
    
    // Делаем плейсхолдер более чистым и лаконичным
    tagInput.placeholder = currentFormTags.length > 0 ? "" : "Например: #Завтрак, #Острое...";
}

tagsContainer.addEventListener('click', () => tagInput.focus());
tagInput.addEventListener('focus', () => tagsContainer.classList.add('focused'));
tagInput.addEventListener('blur', () => tagsContainer.classList.remove('focused'));

// Функция для создания тега из текста в инпуте
function createTagFromInput() {
    const rawText = tagInput.value.replace(',', '');
    const formattedTag = formatTagText(rawText);
    if (formattedTag && !currentFormTags.includes(formattedTag)) {
        currentFormTags.push(formattedTag);
    }
    tagInput.value = ''; 
    renderFormChips();  
}

tagInput.addEventListener('input', () => {
    // По-прежнему ловим запятую
    if (tagInput.value.includes(',')) {
        createTagFromInput();
    }
});

tagInput.addEventListener('keydown', (e) => {
    // Добавляем обработку Enter
    if (e.key === 'Enter') {
        e.preventDefault(); // Запрещаем отправку всей формы при нажатии Enter в этом поле
        if (tagInput.value.trim() !== '') {
            createTagFromInput();
        }
    }
    // Удаление последнего тега по Backspace
    if (e.key === 'Backspace' && tagInput.value === '') {
        currentFormTags.pop(); 
        renderFormChips();     
    }
});

// --- ДОБАВЛЕНИЕ ИЛИ РЕДАКТИРОВАНИЕ В ОБЛАКЕ ---
foodForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return; 

    const title = document.getElementById('title').value;
    const place = document.getElementById('place').value.trim();
    const rating = parseFloat(ratingInput.value);
    const comment = document.getElementById('comment').value;
    const editId = editIdInput.value;

    const foodData = {
        title,
        place,
        rating,
        tags: currentFormTags, 
        comment,
        userId: currentUser.uid
    };

    try {
        if (editId) {
            await updateDoc(doc(db, "foods", editId), foodData);
        } else {
            foodData.createdAt = Date.now(); 
            await addDoc(foodCollection, foodData);
        }
    } catch (error) {
        console.error("Ошибка сохранения документа: ", error);
        alert("Не удалось сохранить данные.");
    }

    resetFormMode();
    navListBtn.click();
});

// --- ОТРИСОВКА КАРТОЧЕК В СПИСКЕ ---
function renderCards() {
    cardsContainer.innerHTML = '';

    let processedList = [...foodList];
    if (currentFilter) {
        processedList = processedList.filter(food => food.tags.includes(currentFilter));
    }

    const searchQuery = searchInput.value.trim().toLowerCase();
    if (searchQuery) {
        processedList = processedList.filter(food => {
            const titleMatch = food.title.toLowerCase().includes(searchQuery);
            const commentMatch = food.comment ? food.comment.toLowerCase().includes(searchQuery) : false;
            const placeMatch = food.place ? food.place.toLowerCase().includes(searchQuery) : false;
            return titleMatch || commentMatch || placeMatch;
        });
    }

    if (processedList.length === 0) {
        if (currentFilter || searchQuery) {
            cardsContainer.innerHTML = `
                <div class="alert alert-warning d-flex justify-content-between align-items-center">
                    <span>По вашему запросу ничего не найдено.</span>
                    <button id="reset-filter-btn" class="btn btn-sm btn-outline-warning">Сбросить всё</button>
                </div>`;
            document.getElementById('reset-filter-btn').addEventListener('click', () => {
                currentFilter = null;
                searchInput.value = '';
                sortSelect.value = 'newest';
                renderCards();
            });
        } else {
            cardsContainer.innerHTML = '<div class="alert alert-secondary">В этом каталоге пока нет блюд.</div>';
        }
        return;
    }

    if (currentFilter) {
        const filterInfo = document.createElement('div');
        filterInfo.className = 'alert alert-info d-flex justify-content-between align-items-center mb-3';
        filterInfo.innerHTML = `<span>Показаны блюда с тегом: <span class="badge bg-primary">#${currentFilter}</span></span> <button id="reset-tag-btn" class="btn btn-sm btn-secondary">Сбросить тег</button>`;
        cardsContainer.appendChild(filterInfo);
        document.getElementById('reset-tag-btn').addEventListener('click', () => {
            currentFilter = null;
            renderCards();
        });
    }

    const sortType = sortSelect.value;
    processedList.sort((a, b) => {
        if (sortType === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
        if (sortType === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
        if (sortType === 'rating-desc') return b.rating - a.rating;
        if (sortType === 'rating-asc') return a.rating - b.rating;
        if (sortType === 'alphabet') return a.title.localeCompare(b.title);
        return 0;
    });

    // Проверяем, является ли текущий авторизованный юзер хозяином этого списка
    const isOwner = currentUser && (currentUser.uid === targetUserId);
    // Если параметров ссылки нет, а пользователь авторизован — это его личный список
    const showControls = !checkUrlParams() ? true : isOwner;

    processedList.forEach(food => {
        const card = document.createElement('div');
        card.className = 'card custom-card food-item-card p-4 mb-3'; 

        const tagsHTML = food.tags.map(tag => `<span class="badge tag-custom me-1 tag-clickable" data-tag="${tag}">#${tag}</span>`).join('');

        card.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                    <h5 class="mb-1 fw-bold text-dark" style="letter-spacing: -0.3px; line-height: 1.4;">${food.title}</h5>
                    ${food.place ? `<div class="card-place-info mt-1" data-place="${food.place}">📍 ${food.place}</div>` : ''}
                </div>
                <span class="badge rating-badge-custom flex-shrink-0 ms-2">★ ${food.rating}</span>
            </div>
            <div class="mb-1" style="margin-right: -4px;">${tagsHTML}</div>
            ${food.comment ? `<p class="card-text text-muted small fst-italic border-top pt-2 mt-3 mb-0" style="color: #636e72 !important;">${food.comment}</p>` : ''}
            
            ${showControls ? `
            <div class="card-actions-container">
                <button class="btn-card-action btn-card-edit btn-edit" data-id="${food.id}">✏️ Редактировать</button>
                <button class="btn-card-action btn-card-delete btn-delete" data-id="${food.id}">🗑️ Удалить</button>
            </div>
            ` : ''}
        `;

        cardsContainer.appendChild(card);
    });

    cardsContainer.querySelectorAll('.tag-clickable').forEach(tagEl => {
        tagEl.addEventListener('click', (e) => {
            currentFilter = e.target.getAttribute('data-tag');
            renderCards();
        });
    });

    cardsContainer.querySelectorAll('.card-place-info').forEach(placeEl => {
        placeEl.addEventListener('click', (e) => {
            const placeName = e.currentTarget.getAttribute('data-place');
            searchInput.value = placeName;
            renderCards();
        });
    });

    if (showControls) {
        cardsContainer.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => editFood(e.target.getAttribute('data-id')));
        });

        cardsContainer.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => deleteFood(e.target.getAttribute('data-id')));
        });
    }
}

// --- УДАЛЕНИЕ ---
async function deleteFood(id) {
    if (confirm('Вы уверены, что хотите удалить это блюдо?')) {
        try {
            await deleteDoc(doc(db, "foods", id));
        } catch (error) {
            console.error("Ошибка удаления: ", error);
        }
    }
}

// --- ПОДГОТОВКА К РЕДАКТИРОВАНИЮ ---
function editFood(id) {
    const foodToEdit = foodList.find(food => food.id === id);
    if (!foodToEdit) return;

    editIdInput.value = foodToEdit.id;
    document.getElementById('title').value = foodToEdit.title;
    document.getElementById('place').value = foodToEdit.place || '';
    ratingInput.value = foodToEdit.rating;
    ratingValue.textContent = foodToEdit.rating;
    
    currentFormTags = [...foodToEdit.tags];
    renderFormChips();
    
    document.getElementById('comment').value = foodToEdit.comment || '';

    submitBtn.textContent = 'Обновить данные блюда';
    submitBtn.className = 'btn btn-brand w-100 py-2.5 fs-6';

    switchScreen(screenForm, navFormBtn);
}

// --- АНАЛИТИКА ---
function renderStats() {
    statsContainer.innerHTML = '';
    topDishesContainer.innerHTML = '';

    if (foodList.length === 0) {
        statsContainer.innerHTML = '<div class="col-12"><div class="alert alert-secondary m-0">В этом каталоге пока нет блюд для расчета статистики.</div></div>';
        return;
    }

    const totalCount = foodList.length;
    const sumRating = foodList.reduce((sum, item) => sum + item.rating, 0);
    const avgRating = (sumRating / totalCount).toFixed(1);
    const favoriteTag = getMostFrequentTag();

    statsContainer.innerHTML = `
        <div class="row g-3">
            <div class="col-12 col-sm-4">
                <div class="p-3 stat-card-custom rounded-3 text-center h-100 d-flex flex-column justify-content-center">
                    <span class="d-block text-muted small fw-bold text-uppercase mb-1" style="font-size: 0.75rem; letter-spacing: 0.5px;">Всего блюд</span>
                    <span class="fs-2 fw-bold">${totalCount}</span>
                </div>
            </div>
            <div class="col-12 col-sm-4">
                <div class="p-3 stat-card-custom rounded-3 text-center h-100 d-flex flex-column justify-content-center">
                    <span class="d-block text-muted small fw-bold text-uppercase mb-1" style="font-size: 0.75rem; letter-spacing: 0.5px;">Средний балл</span>
                    <span class="fs-2 fw-bold" style="color: #2ecc71;">${avgRating}</span>
                </div>
            </div>
            <div class="col-12 col-sm-4">
                <div class="p-3 stat-card-custom rounded-3 text-center h-100 d-flex flex-column justify-content-center">
                    <span class="d-block text-muted small fw-bold text-uppercase mb-1" style="font-size: 0.75rem; letter-spacing: 0.5px;">Частый тег</span>
                    <span class="fs-4 fw-bold text-truncate d-block text-primary" title="#${favoriteTag}">${favoriteTag ? '#' + favoriteTag : '—'}</span>
                </div>
            </div>
        </div>
    `;

    const topDishes = [...foodList].sort((a, b) => b.rating - a.rating).slice(0, 3);

    topDishes.forEach((food, index) => {
        const item = document.createElement('div');
        item.className = 'list-group-item d-flex justify-content-between align-items-center px-0 py-2 border-0 border-bottom';
        const medals = ['🥇', '🥈', '🥉'];
        
        item.innerHTML = `
            <div>
                <span class="me-2">${medals[index]}</span>
                <span class="fw-bold text-dark">${food.title}</span>
            </div>
            <span class="badge rating-badge-custom">★ ${food.rating}</span>
        `;
        topDishesContainer.appendChild(item);
    });
}

function getMostFrequentTag() {
    const tagCounts = {};
    let maxCount = 0;
    let mostFrequent = null;
    foodList.forEach(food => {
        food.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            if (tagCounts[tag] > maxCount) {
                maxCount = tagCounts[tag];
                mostFrequent = tag;
            }
        });
    });
    return mostFrequent;
}

searchInput.addEventListener('input', renderCards);
sortSelect.addEventListener('change', renderCards);

// --- ЛОГИКА ТЁМНОЙ ТЕМЫ ---
const themeToggleBtn = document.getElementById('theme-toggle');

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('rate-the-plate-theme', theme);
    themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

const savedTheme = localStorage.getItem('rate-the-plate-theme');
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

if (savedTheme) {
    setTheme(savedTheme);
} else if (systemPrefersDark) {
    setTheme('dark');
} else {
    setTheme('light');
}

themeToggleBtn.addEventListener('click', () => {
    document.documentElement.classList.add('no-transition');
    const currentTheme = document.documentElement.getAttribute('data-theme');
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    setTimeout(() => {
        document.documentElement.classList.remove('no-transition');
    }, 0);
});