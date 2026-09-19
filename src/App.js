/* global __firebase_config, __app_id, __initial_auth_token */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, setLogLevel, getDocs, writeBatch, orderBy } from 'firebase/firestore';
import { Plus, Trash2, Save, X, ArrowLeft, MapPin, Edit, Timer, Play, Square, AlertTriangle, History, Crosshair, Satellite, StickyNote, Folder, Settings, Moon, Sun, Download, RefreshCw, ArrowUp, ArrowDown, ChevronDown, ChevronUp, CheckCircle, SlidersHorizontal } from 'lucide-react';

// --- IMPORTANT: Google Maps API Key ---
// Using a placeholder key. Replace with your actual Google Maps API key.
const GOOGLE_MAPS_API_KEY = 'AIzaSyBNuLXPG9x36nEEKotOMjaDn8tnPV_Net4';
const isGoogleMapsApiKeyConfigured = Boolean(
    GOOGLE_MAPS_API_KEY && !GOOGLE_MAPS_API_KEY.includes('YOUR_GOOGLE_MAPS_API_KEY')
);

// --- Firebase Configuration ---
const localFirebaseConfig = {
    apiKey: "AIzaSyCwJJH0a6EHcCotHhH597oeGK6eYRnc1T8",
    authDomain: "signal-fc221.firebaseapp.com",
    projectId: "signal-fc221",
    storageBucket: "signal-fc221.firebasestorage.app",
    messagingSenderId: "861546864681",
    appId: "1:861546864681:web:7731be0082418366dcbc38",
    measurementId: "G-MS665R9VML"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : localFirebaseConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'local-dev-app';


// --- UI Helper Functions ---
const showAlert = (message) => {
    const modalId = `alert-modal-${Date.now()}`;
    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = "glass-backdrop fixed inset-0 flex justify-center items-center z-50 p-4";
    modal.innerHTML = `
        <div class="glass-modal p-6 w-full max-w-sm text-center">
            <p class="text-gray-800 dark:text-gray-200">${message}</p>
            <button id="okButton-${modalId}" class="mt-6 w-full p-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md font-semibold transition-colors">확인</button>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById(`okButton-${modalId}`).onclick = () => {
        const el = document.getElementById(modalId);
        if (el) el.remove();
    };
};

const showConfirm = (message, onConfirm, onDeny, onCancel) => {
    const modalId = `confirm-modal-${Date.now()}`;
    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = "glass-backdrop fixed inset-0 flex justify-center items-center z-50 p-4";
    modal.innerHTML = `
        <div class="glass-modal p-6 w-full max-w-sm text-center">
            <p class="text-gray-800 dark:text-gray-200">${message}</p>
            <div class="flex justify-end gap-4 mt-6">
                ${onCancel ? `<button id="cancelBtn-${modalId}" class="p-2 px-4 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md font-semibold transition-colors">취소</button>` : ''}
                ${onDeny ? `<button id="denyBtn-${modalId}" class="p-2 px-4 bg-red-600 text-white hover:bg-red-700 rounded-md font-semibold transition-colors">${onCancel ? '저장 안함' : '삭제'}</button>` : ''}
                <button id="confirmBtn-${modalId}" class="p-2 px-4 bg-blue-600 text-white hover:bg-blue-700 rounded-md font-semibold transition-colors">${onDeny ? '저장' : '확인'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const cleanup = () => {
        const el = document.getElementById(modalId);
        if (el) el.remove();
    };
    document.getElementById(`confirmBtn-${modalId}`).onclick = () => {
        if(onConfirm) onConfirm();
        cleanup();
    };
    if(onDeny) {
        document.getElementById(`denyBtn-${modalId}`).onclick = () => {
            onDeny();
            cleanup();
        };
    }
    if(onCancel) {
        document.getElementById(`cancelBtn-${modalId}`).onclick = () => {
            onCancel();
            cleanup();
        };
    }
};

// --- Google Maps Loader ---
const loadGoogleMapsScript = (callback) => {
    if (window.google && window.google.maps) {
        callback();
        return;
    }
    const existingScript = document.getElementById('googleMapsScript');
    if (!existingScript) {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
        script.id = 'googleMapsScript';
        document.body.appendChild(script);
        script.onload = () => {
            script.setAttribute('data-loaded', 'true');
            callback();
        };
    } else if (existingScript.getAttribute('data-loaded') === 'true') {
        callback();
    } else {
        existingScript.addEventListener('load', callback);
    }
};

export const ALL_DIRECTIONS = ['SB', 'SWB', 'WB', 'NWB', 'NB', 'NEB', 'EB', 'SEB'];
export const DEFAULT_DIRECTIONS = ['SB', 'NB', 'EB', 'WB'];
export const MOVEMENT_DIRECTIONS = ALL_DIRECTIONS;
export const MOVEMENT_TYPES = ['직진', '좌회전', '우회전'];

const directionRotation = { NB: 0, NEB: 45, EB: 90, SEB: 135, SB: 180, SWB: -135, WB: -90, NWB: -45 };
const oppositeDirection = { SB: 'NB', SWB: 'NEB', WB: 'EB', NWB: 'SEB', NB: 'SB', NEB: 'SWB', EB: 'WB', SEB: 'NWB' };

export const MovementArrowIcon = ({ direction, type, className = 'h-9 w-9' }) => {
    const rotation = directionRotation[direction] ?? 0;
    return (
        <svg viewBox="0 0 24 24" className={className} role="img" aria-label={`${direction} ${type}`}>
            <g transform={`rotate(${rotation} 12 12)`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {type === '직진' && <><path d="M12 20V5"/><path d="M8 9l4-4 4 4"/></>}
                {type === '좌회전' && <><path d="M12 20v-6c0-4-2-6-6-6H4"/><path d="M8 4L4 8l4 4"/></>}
                {type === '우회전' && <><path d="M12 20v-6c0-4 2-6 6-6h2"/><path d="M16 4l4 4-4 4"/></>}
            </g>
        </svg>
    );
};

export const normalizePhaseMovements = (phase = {}) => {
    if (Array.isArray(phase.movements)) {
        const seen = new Set();
        return phase.movements.filter(movement => {
            const key = `${movement?.direction}-${movement?.type}`;
            if (!MOVEMENT_DIRECTIONS.includes(movement?.direction) || !MOVEMENT_TYPES.includes(movement?.type) || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    const direction = MOVEMENT_DIRECTIONS.includes(phase.direction) ? phase.direction : null;
    if (!direction || !phase.type || phase.type === '올레드') return [];
    const add = (dir, type) => ({ direction: dir, type });
    switch (phase.type) {
        case '직좌동시': return [add(direction, '직진'), add(direction, '좌회전')];
        case '양방직진': return [add(direction, '직진'), add(oppositeDirection[direction], '직진')];
        case '양방좌회전': return [add(direction, '좌회전'), add(oppositeDirection[direction], '좌회전')];
        case '적신호시 우회전': return [add(direction, '우회전')];
        default: return MOVEMENT_TYPES.includes(phase.type) ? [add(direction, phase.type)] : [];
    }
};

export const formatPhaseMovements = (movements = []) => {
    if (!movements.length) return '올레드(이동류 없음)';
    return MOVEMENT_DIRECTIONS
        .map(direction => {
            const types = MOVEMENT_TYPES.filter(type => movements.some(movement => movement.direction === direction && movement.type === type));
            return types.length ? `${direction} ${types.join('·')}` : null;
        })
        .filter(Boolean)
        .join(' + ');
};

const escapeCsvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const buildExportCsv = (projects = [], intersectionsData = {}, selectedProjects = {}) => {
    const headers = ['프로젝트', '교차로 번호', '교차로명', '위도', '경도', '사용 방향', '현시', '이동류', '최종 시간(초)', '전체 시간기록(초)', '비보호 좌회전', '현장 메모'];
    const rows = [];

    projects.forEach(project => {
        if (!selectedProjects[project.id]) return;
        (intersectionsData[project.id] || []).forEach(intersection => {
            const phasesToExport = Array.isArray(intersection.phases) && intersection.phases.length
                ? intersection.phases
                : [{ movements: [], times: [], isPermissive: false }];
            phasesToExport.forEach((phase, index) => {
                const times = Array.isArray(phase.times) ? phase.times : [];
                rows.push([
                    project.name,
                    intersection.number,
                    intersection.name,
                    intersection.location?.lat ?? '',
                    intersection.location?.lng ?? '',
                    (intersection.directions || DEFAULT_DIRECTIONS).join(' · '),
                    `P${index + 1}`,
                    formatPhaseMovements(normalizePhaseMovements(phase)),
                    times.length ? times[times.length - 1] : '',
                    times.join(' · '),
                    phase.isPermissive ? 'Y' : 'N',
                    intersection.memo || '',
                ].map(escapeCsvCell));
            });
        });
    });

    return rows.length ? `\uFEFF${headers.map(escapeCsvCell).join(',')}\r\n${rows.map(row => row.join(',')).join('\r\n')}` : '';
};

export const PhaseMovementSummary = ({ movements = [], isPermissive = false }) => {
    if (!movements.length) {
        return <span className="inline-flex items-center gap-2 text-sm font-semibold text-red-500"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />올레드</span>;
    }
    return (
        <div className="flex flex-wrap gap-1.5" aria-label={formatPhaseMovements(movements)}>
            {MOVEMENT_DIRECTIONS.flatMap(direction => MOVEMENT_TYPES
                .filter(type => movements.some(movement => movement.direction === direction && movement.type === type))
                .map(type => {
                    const permissiveLeft = isPermissive && type === '좌회전';
                    return (
                        <span key={`${direction}-${type}`} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${permissiveLeft ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300'}`}>
                            <MovementArrowIcon direction={direction} type={type} className="h-4 w-4" />
                            {direction} {type}
                        </span>
                    );
                }))}
        </div>
    );
};

// --- Components ---

const ExportModal = ({ isOpen, onClose, projects, db, userId, appId }) => {
    const [selectedProjects, setSelectedProjects] = useState({});
    const [intersectionsData, setIntersectionsData] = useState({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isOpen && db && userId && appId) {
            setIsLoading(true);
            const fetchAllIntersections = async () => {
                const allData = {};
                for (const project of projects) {
                    const collectionPath = `/artifacts/${appId}/users/${userId}/projects/${project.id}/intersections`;
                    const q = query(collection(db, collectionPath), orderBy("number", "asc"));
                    const snapshot = await getDocs(q);
                    allData[project.id] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                }
                setIntersectionsData(allData);
                setIsLoading(false);
            };
            fetchAllIntersections();
        }
    }, [isOpen, projects, db, userId, appId]);

    const handleProjectToggle = (projectId) => {
        setSelectedProjects(prev => ({...prev, [projectId]: !prev[projectId]}));
    };
    
    const handleExport = () => {
        const csvContent = buildExportCsv(projects, intersectionsData, selectedProjects);
        if (!csvContent) {
            showAlert("내보낼 데이터가 없습니다. 프로젝트를 선택해주세요.");
            return;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", downloadUrl);
        link.setAttribute("download", `signal_data_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="glass-backdrop fixed inset-0 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="glass-modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold mb-4 dark:text-white">내보낼 데이터 선택</h3>
                <div className="max-h-96 overflow-y-auto space-y-2">
                    {isLoading ? <p className="dark:text-gray-300">데이터 로딩 중...</p> : projects.map(project => (
                        <div key={project.id} className="p-2 border dark:border-gray-700 rounded-md">
                            <label className="flex items-center gap-2 font-semibold dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={!!selectedProjects[project.id]}
                                    onChange={() => handleProjectToggle(project.id)}
                                    className="w-5 h-5 accent-blue-600"
                                />
                                {project.name}
                            </label>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={onClose} className="p-2 px-4 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md font-semibold transition-colors">취소</button>
                    <button onClick={handleExport} disabled={isLoading} className="p-2 px-4 bg-blue-600 text-white hover:bg-blue-700 rounded-md font-semibold transition-colors disabled:bg-gray-400">내보내기</button>
                </div>
            </div>
        </div>
    )
};

const SettingsModal = ({ isOpen, onClose, isDarkMode, onToggleDarkMode, onBackup, onReset }) => {
    if (!isOpen) return null;

    return (
        <div className="glass-backdrop fixed inset-0 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="glass-modal p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold dark:text-white">설정</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300"><X size={20}/></button>
                </div>
                <div className="space-y-4">
                    <button onClick={onToggleDarkMode} className="w-full flex items-center justify-between p-3 bg-white/55 dark:bg-white/5 rounded-2xl hover:bg-white/80 dark:hover:bg-white/10">
                        <span className="font-semibold dark:text-gray-200">다크 모드</span>
                        <div className="flex items-center gap-2">
                            {isDarkMode ? <Moon size={20} className="text-yellow-400"/> : <Sun size={20} className="text-orange-500"/>}
                            <div className={`w-12 h-6 rounded-full flex items-center transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-gray-300'}`}>
                                <span className={`inline-block w-5 h-5 bg-white rounded-full transform transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`}></span>
                            </div>
                        </div>
                    </button>
                    <button onClick={onBackup} className="w-full flex items-center gap-3 p-3 bg-white/55 dark:bg-white/5 rounded-2xl hover:bg-white/80 dark:hover:bg-white/10 font-semibold dark:text-gray-200">
                        <Download size={20}/> 데이터 내보내기
                    </button>
                    <button onClick={onReset} className="w-full flex items-center gap-3 p-3 bg-red-100/70 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-2xl hover:bg-red-200/80 dark:hover:bg-red-900/60 font-semibold">
                        <RefreshCw size={20}/> 앱 초기화
                    </button>
                </div>
            </div>
        </div>
    );
};


const AddProjectModal = ({ isOpen, onClose, onSave, initialName }) => {
    const [projectName, setProjectName] = useState(initialName);

    useEffect(() => {
        setProjectName(initialName);
    }, [initialName, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (projectName.trim()) {
            onSave(projectName.trim());
        } else {
            showAlert("프로젝트 이름을 입력해주세요.");
        }
    };

    return (
        <div className="glass-backdrop fixed inset-0 flex justify-center items-center z-50 p-4">
            <div className="glass-modal p-6 w-full max-w-sm">
                <h3 className="text-lg font-bold mb-4 dark:text-white">새 프로젝트 추가</h3>
                <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="프로젝트 이름"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={onClose} className="p-2 px-4 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md font-semibold transition-colors">취소</button>
                    <button onClick={handleSave} className="p-2 px-4 bg-blue-600 text-white hover:bg-blue-700 rounded-md font-semibold transition-colors">저장</button>
                </div>
            </div>
        </div>
    );
};


export const DirectionSettingsModal = ({ directions = DEFAULT_DIRECTIONS, usedDirections = [], onSave, onClose }) => {
    const [selectedDirections, setSelectedDirections] = useState(directions);
    const [showDiagonalDirections, setShowDiagonalDirections] = useState(false);
    const diagonalDirections = ['SWB', 'NWB', 'NEB', 'SEB'];
    const selectedDiagonalCount = directions.filter(direction => !DEFAULT_DIRECTIONS.includes(direction)).length;

    const toggleDirection = (direction) => {
        const isSelected = selectedDirections.includes(direction);
        if (isSelected && usedDirections.includes(direction)) return;
        setSelectedDirections(isSelected
            ? selectedDirections.filter(item => item !== direction)
            : [...selectedDirections, direction]);
    };

    const orderedDirections = ALL_DIRECTIONS.filter(direction => selectedDirections.includes(direction));

    return (
        <div className="glass-backdrop fixed inset-0 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="glass-modal p-5 sm:p-6 w-full max-w-lg" onClick={event => event.stopPropagation()}>
                <h3 className="text-lg font-bold dark:text-white">교차로 방향 설정</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">기본 4방향에 대각선 방향을 추가해 5지 이상 교차로를 구성하세요.</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                    {DEFAULT_DIRECTIONS.map(direction => (
                        <div key={direction} className="flex items-center gap-3 rounded-2xl border border-white/70 dark:border-white/10 bg-white/55 dark:bg-white/5 px-4 py-3 text-gray-700 dark:text-gray-200">
                            <MovementArrowIcon direction={direction} type="직진" className="h-6 w-6 text-blue-600 dark:text-blue-300" />
                            <span className="font-bold">{direction}</span><span className="ml-auto text-xs text-gray-400">기본</span>
                        </div>
                    ))}
                </div>
                <button type="button" aria-expanded={showDiagonalDirections} onClick={() => setShowDiagonalDirections(value => !value)} className="mt-5 w-full flex items-center justify-between rounded-2xl border border-white/70 dark:border-white/10 bg-white/50 dark:bg-white/5 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-200">
                    <span>5지 이상 교차로 · 대각선 방향 {selectedDiagonalCount ? `${selectedDiagonalCount}개 사용 중` : '추가'}</span>
                    {showDiagonalDirections ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {showDiagonalDirections && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                    {diagonalDirections.map(direction => {
                        const selected = selectedDirections.includes(direction);
                        const inUse = usedDirections.includes(direction);
                        return (
                            <button key={direction} type="button" aria-pressed={selected} aria-label={`${direction} 방향 ${selected ? '제거' : '추가'}`} disabled={selected && inUse} onClick={() => toggleDirection(direction)} className={`min-h-20 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all ${selected ? 'border-blue-400 bg-blue-100/80 text-blue-700 dark:bg-blue-400/20 dark:text-blue-200' : 'border-white/70 bg-white/50 text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-300'} disabled:opacity-70 disabled:cursor-not-allowed`}>
                                <MovementArrowIcon direction={direction} type="직진" className="h-8 w-8" />
                                <span className="font-bold text-sm">{direction}</span>
                                {inUse && <span className="text-[10px]">사용 중</span>}
                            </button>
                        );
                    })}
                </div>}
                <div className="mt-4 rounded-2xl bg-white/55 dark:bg-white/5 p-3 text-sm text-gray-600 dark:text-gray-300">활성 방향 {orderedDirections.length}개: <strong>{orderedDirections.join(' · ')}</strong></div>
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-2xl bg-gray-200 dark:bg-gray-600 font-semibold">취소</button>
                    <button type="button" onClick={() => onSave(orderedDirections)} className="px-5 py-2 rounded-2xl bg-blue-600 text-white font-semibold hover:bg-blue-700">방향 적용</button>
                </div>
            </div>
        </div>
    );
};

export const PhaseSelectionModal = ({ directions = DEFAULT_DIRECTIONS, initialMovements = [], isPermissive = false, onSave, onClose }) => {
    const [selectedMovements, setSelectedMovements] = useState(initialMovements);

    const toggleMovement = (direction, type) => {
        const exists = selectedMovements.some(movement => movement.direction === direction && movement.type === type);
        setSelectedMovements(exists
            ? selectedMovements.filter(movement => !(movement.direction === direction && movement.type === type))
            : [...selectedMovements, { direction, type }]);
    };

    return (
        <div className="glass-backdrop fixed inset-0 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="glass-modal p-4 sm:p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold mb-1 dark:text-white">현시 이동류 조합</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">방향별 이동류를 여러 개 선택해 하나의 현시를 만드세요. 선택이 없으면 올레드로 저장됩니다.</p>
                <div className="grid grid-cols-[3rem_repeat(3,minmax(0,1fr))] gap-1.5 sm:gap-2" role="grid" aria-label={`${directions.length}방향 3이동류 선택표`}>
                    <div aria-hidden="true" />
                    {MOVEMENT_TYPES.map(type => <div key={type} className="text-center text-[11px] sm:text-sm font-semibold text-gray-600 dark:text-gray-300 break-keep">{type}</div>)}
                    {directions.map(direction => (
                        <React.Fragment key={direction}>
                            <div className="flex items-center justify-center text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200">{direction}</div>
                            {MOVEMENT_TYPES.map(type => {
                                const selected = selectedMovements.some(movement => movement.direction === direction && movement.type === type);
                                const permissiveLeft = selected && isPermissive && type === '좌회전';
                                return (
                                    <button
                                        key={`${direction}-${type}`}
                                        type="button"
                                        aria-pressed={selected}
                                        aria-label={`${direction} ${type} ${selected ? '선택 해제' : '선택'}`}
                                        onClick={() => toggleMovement(direction, type)}
                                        className={`min-h-16 sm:min-h-20 flex items-center justify-center rounded-2xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${permissiveLeft ? 'border-amber-400 bg-amber-100/80 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300' : selected ? 'border-emerald-400 bg-emerald-100/80 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300' : 'border-white/70 bg-white/50 text-gray-500 hover:border-blue-300 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10'}`}
                                    >
                                        <MovementArrowIcon direction={direction} type={type} className="h-8 w-8 sm:h-10 sm:w-10" />
                                    </button>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
                <div className="mt-4 rounded-2xl bg-white/55 dark:bg-white/5 border border-white/60 dark:border-white/10 p-3 text-sm text-gray-700 dark:text-gray-200 min-h-11">
                    <span className="font-semibold">선택 현시: </span>{formatPhaseMovements(selectedMovements)}
                </div>
                <div className="mt-5 flex flex-wrap justify-between gap-2">
                    <button type="button" onClick={() => setSelectedMovements([])} className="p-2 px-4 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md font-semibold">전체 해제</button>
                    <div className="flex gap-2 ml-auto">
                        <button type="button" onClick={onClose} className="p-2 px-4 bg-gray-200 dark:bg-gray-600 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md font-semibold">취소</button>
                        <button type="button" onClick={() => onSave(selectedMovements)} className="p-2 px-5 bg-blue-600 text-white hover:bg-blue-700 rounded-md font-semibold">현시 적용</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const IntersectionDetail = ({ intersection, db, userId, appId, onBack, projectId }) => {
    const [details, setDetails] = useState(null);
    const [map, setMap] = useState(null);
    const [mapCenter, setMapCenter] = useState(null); // Separate state for map center to avoid re-rendering map on drag
    const [mapTypeId, setMapTypeId] = useState('roadmap');
    const searchInputRef = useRef(null);
    const mapContainerRef = useRef(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingLocation, setIsSavingLocation] = useState(false); // New state for location saving
    const [phases, setPhases] = useState([]);
    const [isPhaseModalOpen, setIsPhaseModalOpen] = useState(false);
    const [isDirectionSettingsOpen, setIsDirectionSettingsOpen] = useState(false);
    const [directions, setDirections] = useState(DEFAULT_DIRECTIONS);
    const [editingIndex, setEditingIndex] = useState(null);
    const [timer, setTimer] = useState({ active: false, index: null, startTime: 0, elapsed: 0 });
    const intervalIdRef = useRef(null);
    const [isRecordModeActive, setIsRecordModeActive] = useState(false);
    const [currentRecordingPhaseIndex, setCurrentRecordingPhaseIndex] = useState(null);
    const [editingTime, setEditingTime] = useState({ index: null, value: '' });
    const [mapIcons, setMapIcons] = useState({});
    const [memo, setMemo] = useState('');
    const markersRef = useRef({});
    const mainMarkerRef = useRef(null); // Ref for the main intersection marker
    const [isDirty, setIsDirty] = useState(false);
    const initialData = useRef(null);
    const [isLocationVisible, setIsLocationVisible] = useState(true);

    const docRef = useMemo(() => doc(db, `/artifacts/${appId}/users/${userId}/projects/${projectId}/intersections`, intersection.id), [db, appId, userId, projectId, intersection.id]);

    const handleSaveAll = async () => {
        setIsSaving(true);
        try {
            const dataToSave = {
                location: mapCenter, // Save the current map center
                mapIcons: mapIcons,
                memo: memo,
                phases: phases,
                directions: directions,
            };
            await updateDoc(docRef, dataToSave);
            
            initialData.current = {
                location: mapCenter,
                mapIcons: mapIcons,
                memo: memo,
                phases: phases,
                directions: directions,
            };
            setIsDirty(false);
            showAlert("모든 변경사항이 저장되었습니다.");
        } catch (error) {
            console.error("Failed to save data:", error);
            showAlert("저장에 실패했습니다.");
        } finally {
            setIsSaving(false);
        }
    };

    // *** NEW FUNCTION: Save only location and icons ***
    const handleSaveLocation = async () => {
        if (!map) return;
        setIsSavingLocation(true);
        try {
            const newLocation = map.getCenter().toJSON();
            await updateDoc(docRef, {
                location: newLocation,
                mapIcons: mapIcons,
            });
            // Update the local state to match saved data
            setMapCenter(newLocation); 
            // Update the initial data snapshot to prevent "isDirty" from being true
            if(initialData.current) {
                initialData.current.location = newLocation;
                initialData.current.mapIcons = mapIcons;
            }
            showAlert("교차로 위치와 아이콘이 저장되었습니다.");
        } catch (error) {
            console.error("Failed to save location:", error);
            showAlert("위치 저장에 실패했습니다.");
        } finally {
            setIsSavingLocation(false);
        }
    };

    const handleBack = () => {
        if (isDirty) {
            showConfirm(
                "저장하지 않은 변경사항이 있습니다. 저장하시겠습니까?",
                () => { handleSaveAll().then(onBack) }, // Save and go back
                onBack, // Don't save and go back
                () => {} // Cancel
            );
        } else {
            onBack();
        }
    };

    useEffect(() => {
        const unsub = onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setDetails(data);
                if (data.location) {
                    setMapCenter(data.location);
                }
                setMapIcons(data.mapIcons || {});
                setMemo(data.memo || '');
                const validPhases = (data.phases && Array.isArray(data.phases) && data.phases.length > 0 ? data.phases : Array.from({ length: 4 }, () => ({ movements: [], times: [], isPermissive: false }))).map(p => ({
                    movements: normalizePhaseMovements(p),
                    times: Array.isArray(p.times) ? p.times : [],
                    isPermissive: p.isPermissive || false
                }));
                setPhases(validPhases);
                const directionsInUse = [
                    ...validPhases.flatMap(phase => phase.movements.map(movement => movement.direction)),
                    ...Object.keys(data.mapIcons || {})
                ];
                const savedDirections = Array.isArray(data.directions) ? data.directions : [];
                const validDirections = ALL_DIRECTIONS.filter(direction => DEFAULT_DIRECTIONS.includes(direction) || savedDirections.includes(direction) || directionsInUse.includes(direction));
                setDirections(validDirections);
                
                const initialSnapshot = { 
                    location: data.location, 
                    mapIcons: data.mapIcons || {}, 
                    memo: data.memo || '',
                    phases: validPhases,
                    directions: validDirections,
                };
                if (!initialData.current) {
                    initialData.current = initialSnapshot;
                }
            } else {
                console.warn(`Intersection document (${docRef.path}) no longer exists. Navigating back.`);
                showAlert("교차로 데이터가 삭제되었거나 찾을 수 없습니다. 목록으로 돌아갑니다.");
                onBack();
            }
        });
        return () => unsub();
    }, [docRef, onBack]);

    useEffect(() => {
        if (initialData.current) {
            const locationChanged = JSON.stringify(initialData.current.location) !== JSON.stringify(mapCenter);
            const iconsChanged = JSON.stringify(initialData.current.mapIcons) !== JSON.stringify(mapIcons);
            const memoChanged = initialData.current.memo !== memo;
            const phasesChanged = JSON.stringify(initialData.current.phases) !== JSON.stringify(phases);
            const directionsChanged = JSON.stringify(initialData.current.directions) !== JSON.stringify(directions);
            setIsDirty(locationChanged || iconsChanged || memoChanged || phasesChanged || directionsChanged);
        }
    }, [mapCenter, mapIcons, memo, phases, directions]);

    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    useEffect(() => {
        const mapContainer = mapContainerRef.current;
        if (!details || !mapContainer || !isLocationVisible || !isGoogleMapsApiKeyConfigured) return;
    
        loadGoogleMapsScript(() => {
            if (!mapContainerRef.current) return;
            const initialCenter = mapCenter || { lat: 37.5665, lng: 126.9780 };
            const gMap = new window.google.maps.Map(mapContainerRef.current, {
                center: initialCenter,
                zoom: 17,
                disableDefaultUI: true,
                mapTypeId: mapTypeId
            });
            setMap(gMap);

            mainMarkerRef.current = new window.google.maps.Marker({ 
                position: initialCenter, 
                map: gMap, 
                draggable: false, // Main marker is not draggable, map center is the source of truth
                zIndex: 10 
            });

            gMap.addListener('center_changed', () => {
                const newCenter = gMap.getCenter();
                if (mainMarkerRef.current) {
                    mainMarkerRef.current.setPosition(newCenter);
                }
            });

            if (searchInputRef.current) {
                const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current);
                autocomplete.bindTo('bounds', gMap);
                autocomplete.addListener('place_changed', () => {
                    const place = autocomplete.getPlace();
                    if (place.geometry && place.geometry.location) {
                        const newLoc = place.geometry.location;
                        gMap.setCenter(newLoc);
                        setMapCenter(newLoc.toJSON());
                    }
                });
            }
        });
        
        return () => {
            if (mapContainer) {
                mapContainer.innerHTML = '';
            }
            setMap(null);
            mainMarkerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [details, isLocationVisible]);

    useEffect(() => {
        if (map) map.setMapTypeId(mapTypeId);
    }, [map, mapTypeId]);
    
    useEffect(() => {
        if (!map) return;
        Object.keys(markersRef.current).forEach(dir => {
            if (!mapIcons[dir]) {
                markersRef.current[dir].setMap(null);
                delete markersRef.current[dir];
            }
        });

        Object.entries(mapIcons).forEach(([dir, pos]) => {
            if (markersRef.current[dir]) {
                markersRef.current[dir].setPosition(pos);
            } else {
                const newMarker = new window.google.maps.Marker({
                    position: pos,
                    map: map,
                    draggable: true,
                    label: { text: dir, color: 'white', fontWeight: 'bold' },
                    icon: {
                        path: window.google.maps.SymbolPath.CIRCLE,
                        scale: 15,
                        fillColor: '#4285F4',
                        fillOpacity: 1,
                        strokeWeight: 0
                    }
                });
                newMarker.addListener('dragend', (e) => {
                    setMapIcons(prev => ({ ...prev, [dir]: { lat: e.latLng.lat(), lng: e.latLng.lng() } }));
                });
                markersRef.current[dir] = newMarker;
            }
        });
    }, [map, mapIcons]);


    useEffect(() => {
        if (map && mapCenter) {
            map.setCenter(mapCenter);
        }
    }, [map, mapCenter]);

    const handleFindMe = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                const newLoc = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                if (map) {
                    map.setCenter(newLoc);
                }
                setMapCenter(newLoc);
            }, () => showAlert('현재 위치를 가져올 수 없습니다. 브라우저의 위치 정보 접근 권한을 확인해주세요.'));
        } else {
            showAlert('이 브라우저에서는 위치 정보 기능을 지원하지 않습니다.');
        }
    };
    
    const addMapIcon = (dir) => {
        if (!map || mapIcons[dir]) return;
        setMapIcons(prev => ({ ...prev, [dir]: map.getCenter().toJSON() }));
    };

    const removeMapIcon = (dir) => {
        const newIcons = { ...mapIcons };
        delete newIcons[dir];
        setMapIcons(newIcons);
    };

    const handlePhaseTypeClick = (index) => {
        setEditingIndex(index);
        setIsPhaseModalOpen(true);
    };

    const updatePhases = (newPhases) => {
        setPhases(newPhases);
        // Deferring DB update to save button
    };

    const handleSavePhaseMovements = (movements) => {
        const newPhases = JSON.parse(JSON.stringify(phases));
        newPhases[editingIndex].movements = movements;
        if (!movements.some(movement => movement.type === '좌회전')) {
            newPhases[editingIndex].isPermissive = false;
        }
        updatePhases(newPhases);
        setIsPhaseModalOpen(false);
        setEditingIndex(null);
    };

    const handleSaveDirections = (nextDirections) => {
        setDirections(nextDirections);
        setIsDirectionSettingsOpen(false);
    };

    const stopAndResetTimer = useCallback(() => {
        if (intervalIdRef.current) clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
        setTimer({ active: false, index: null, startTime: 0, elapsed: 0 });
    }, []);

    const startTimer = useCallback((index) => {
        stopAndResetTimer();
        const startTime = Date.now();
        setTimer({ active: true, index, startTime, elapsed: 0 });
        intervalIdRef.current = setInterval(() => {
            setTimer(t => ({ ...t, elapsed: (Date.now() - t.startTime) / 1000 }));
        }, 100);
    }, [stopAndResetTimer]);

    const handleIndividualTimerToggle = (index) => {
        if (isRecordModeActive) return;
        if (timer.active && timer.index === index) {
            const finalTime = parseFloat(timer.elapsed.toFixed(1));
            stopAndResetTimer();
            const newPhases = JSON.parse(JSON.stringify(phases));
            if (!Array.isArray(newPhases[index].times)) newPhases[index].times = [];
            newPhases[index].times.push(finalTime);
            updatePhases(newPhases);
        } else if (!timer.active) {
            startTimer(index);
        }
    };

    const handleTogglePermissive = (index) => {
        if (isRecordModeActive) return;
        const newPhases = JSON.parse(JSON.stringify(phases));
        newPhases[index].isPermissive = !newPhases[index].isPermissive;
        updatePhases(newPhases);
    };
    
    const handleToggleRecordMode = () => {
        if (isRecordModeActive) {
            setIsRecordModeActive(false);
            setCurrentRecordingPhaseIndex(null);
            stopAndResetTimer();
        } else {
            setIsRecordModeActive(true);
            setCurrentRecordingPhaseIndex(0);
            startTimer(0);
        }
    };

    const handleRecordAndNext = () => {
        if (!isRecordModeActive || currentRecordingPhaseIndex === null) return;
        const finalTime = parseFloat(timer.elapsed.toFixed(1));
        const newPhases = JSON.parse(JSON.stringify(phases));
        if (!Array.isArray(newPhases[currentRecordingPhaseIndex].times)) newPhases[currentRecordingPhaseIndex].times = [];
        newPhases[currentRecordingPhaseIndex].times.push(finalTime);
        updatePhases(newPhases);
        const nextIndex = currentRecordingPhaseIndex + 1;
        if (nextIndex < phases.length) {
            setCurrentRecordingPhaseIndex(nextIndex);
            startTimer(nextIndex);
        } else {
            handleToggleRecordMode();
        }
    };

    const handleAddPhase = () => {
        if (isRecordModeActive) return;
        const newPhases = [...phases, { movements: [], times: [], isPermissive: false }];
        updatePhases(newPhases);
    };

    const handleRemovePhase = (indexToRemove) => {
        if (isRecordModeActive || phases.length <= 1) return;
        const phaseToRemove = phases[indexToRemove];
        const confirmationMessage = (phaseToRemove.times && phaseToRemove.times.length > 0)
            ? '이 현시에는 기록된 시간이 있습니다. 정말로 삭제하시겠습니까?'
            : '정말로 이 현시를 삭제하시겠습니까?';
        showConfirm(confirmationMessage, () => {
            const newPhases = phases.filter((_, i) => i !== indexToRemove);
            updatePhases(newPhases);
        }, null, () => {});
    };
    
    const handleEditTimeClick = (index, currentTime) => {
        if (isRecordModeActive || timer.active) return;
        setEditingTime({ index, value: String(currentTime) });
    };

    const handleSaveTime = (index) => {
        const newTime = parseFloat(editingTime.value);
        if (isNaN(newTime) || newTime < 0) {
            setEditingTime({ index: null, value: '' });
            return;
        }
        const newPhases = JSON.parse(JSON.stringify(phases));
        if (!Array.isArray(newPhases[index].times)) newPhases[index].times = [];
        if (newPhases[index].times.length > 0) {
            newPhases[index].times[newPhases[index].times.length - 1] = newTime;
        } else {
            newPhases[index].times.push(newTime);
        }
        updatePhases(newPhases);
        setEditingTime({ index: null, value: '' });
    };

    const cycleLength = useMemo(() => {
        return phases.reduce((sum, phase) => {
            const lastTime = phase.times && phase.times.length > 0 ? phase.times[phase.times.length - 1] : 0;
            return sum + lastTime;
        }, 0).toFixed(1);
    }, [phases]);

    if (!details) return <div className="p-6 text-center dark:text-gray-300">교차로 정보를 불러오는 중...</div>;

    return (
        <div className="p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8 lg:pb-28 max-w-5xl mx-auto">
            {isPhaseModalOpen && editingIndex !== null && <PhaseSelectionModal directions={directions} initialMovements={phases[editingIndex]?.movements || []} isPermissive={phases[editingIndex]?.isPermissive || false} onClose={() => { setIsPhaseModalOpen(false); setEditingIndex(null); }} onSave={handleSavePhaseMovements} />}
            {isDirectionSettingsOpen && <DirectionSettingsModal directions={directions} usedDirections={[...new Set([...phases.flatMap(phase => phase.movements.map(movement => movement.direction)), ...Object.keys(mapIcons)])]} onClose={() => setIsDirectionSettingsOpen(false)} onSave={handleSaveDirections} />}
            <header className="mb-6">
                <div className="flex items-center justify-between">
                    <button onClick={handleBack} className="glass-toolbar flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-white/10 transition-all"><ArrowLeft size={20} /> 목록으로</button>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white text-center mt-2 truncate">{details.number}. {details.name}</h1>
            </header>

            <section className="mb-8">
                 <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xl font-semibold flex items-center gap-2 dark:text-white"><MapPin size={24} className="text-blue-500" /> 교차로 위치</h2>
                    <button onClick={() => setIsLocationVisible(!isLocationVisible)} aria-label={isLocationVisible ? '지도 영역 접기' : '지도 영역 펼치기'} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                        {isLocationVisible ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                    </button>
                </div>
                {isLocationVisible && (
                    <>
                        <div className="relative">
                            <div ref={mapContainerRef} className="w-full h-96 bg-gray-200 dark:bg-gray-700 rounded-[2rem] shadow-xl overflow-hidden border border-white/70 dark:border-white/10">
                                {!isGoogleMapsApiKeyConfigured &&
                                    <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-red-50 text-red-700 p-4 text-center">
                                        <AlertTriangle size={48} className="mb-4" />
                                        <p className="text-lg font-bold">Google Maps API 키가 유효하지 않습니다.</p>
                                        <p className="text-sm font-normal mt-2">코드 상단의 'YOUR_GOOGLE_MAPS_API_KEY'를<br />실제 API 키로 교체해주세요.</p>
                                    </div>
                                }
                            </div>
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="장소 검색..."
                                className="absolute top-3 left-3 w-1/2 max-w-xs px-4 py-2 bg-white dark:bg-gray-800 dark:text-white rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="absolute top-3 right-3 flex flex-col gap-2">
                                <button onClick={handleFindMe} title="현재 위치 찾기" aria-label="현재 위치 찾기" className="p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <Crosshair className="text-gray-700 dark:text-gray-300" size={20} />
                                </button>
                                <button onClick={() => setMapTypeId(mapTypeId === 'roadmap' ? 'satellite' : 'roadmap')} title="위성/지도 전환" aria-label="위성/지도 전환" className="p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <Satellite className="text-gray-700 dark:text-gray-300" size={20} />
                                </button>
                            </div>
                        </div>
                         <div className="mt-4 p-4 content-surface">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">방향 아이콘 (클릭하여 지도에 추가/삭제)</h3>
                                <div className="flex items-center justify-start gap-3 flex-wrap">
                                    {directions.map(dir => (
                                        <button
                                            key={dir}
                                            onClick={() => mapIcons[dir] ? removeMapIcon(dir) : addMapIcon(dir)}
                                            className={`w-12 h-12 rounded-full font-bold text-sm transition-colors flex justify-center items-center shadow-md ${mapIcons[dir] ? 'bg-blue-600 text-white ring-2 ring-offset-2 ring-blue-600' : 'bg-white dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                        >
                                            {dir}
                                        </button>
                                    ))}
                                </div>
                                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">지도에 추가된 아이콘은 드래그하여 위치를 옮길 수 있습니다.</p>
                            </div>
                            {/* *** NEW BUTTON: Save Location *** */}
                            <button 
                                onClick={handleSaveLocation} 
                                disabled={isSavingLocation}
                                className="soft-button w-full mt-4 p-3 bg-teal-500 text-white font-semibold hover:bg-teal-600 flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {isSavingLocation ? (
                                    <>
                                        <RefreshCw size={18} className="animate-spin" />
                                        <span>저장 중...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle size={18} />
                                        <span>교차로 위치 저장</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </>
                )}
            </section>
            
            <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold flex items-center gap-2 dark:text-white"><Timer size={24} className="text-green-500" /> 신호 현시 정보</h2>
                    <button type="button" onClick={() => setIsDirectionSettingsOpen(true)} className="glass-toolbar flex items-center gap-2 px-3 py-2 text-sm font-semibold text-blue-700 dark:text-blue-200 hover:bg-white/80 dark:hover:bg-white/10"><SlidersHorizontal size={16} /> 방향 설정 <span className="text-xs opacity-70">{directions.length}</span></button>
                </div>
                <div className="content-surface p-3 sm:p-4">
                    <div className="mb-3 flex justify-between items-center bg-white/55 dark:bg-white/5 border border-white/60 dark:border-white/10 px-4 py-3 rounded-2xl">
                        <div className="flex items-baseline gap-2"><span className="font-bold dark:text-white">신호 주기</span><span className="text-xs text-gray-500 dark:text-gray-400">{phases.length}현시</span></div>
                        <span className="font-bold text-xl text-emerald-700 dark:text-emerald-400">{cycleLength}초</span>
                    </div>
                    <div className="space-y-2">
                        {phases.map((phase, index) => {
                             const latestTime = phase.times && phase.times.length > 0 ? phase.times[phase.times.length - 1] : 0;
                             const isCurrentlyTiming = timer.active && timer.index === index;
                             const isThisPhaseInRecordMode = isRecordModeActive && currentRecordingPhaseIndex === index;

                            return(
                            <div key={index} className={`phase-card p-3 space-y-2 transition-all duration-300 ${isThisPhaseInRecordMode ? 'phase-card-active' : ''}`}>
                                <div className="flex justify-between items-center gap-2">
                                    <div className="flex items-stretch gap-2 flex-grow min-w-0">
                                        <span className="flex-shrink-0 flex items-center justify-center h-11 min-w-11 px-2 rounded-2xl bg-blue-600 text-white font-bold text-sm shadow-sm">P{index + 1}</span>
                                        <button onClick={() => handlePhaseTypeClick(index)} disabled={isRecordModeActive} aria-label={`${index + 1}번 현시 이동류 조합 편집`} title="눌러서 현시 이동류 조합 편집" className="group w-full flex items-center justify-between gap-2 px-3 py-2 min-h-11 bg-white/55 dark:bg-white/5 hover:bg-blue-50/90 dark:hover:bg-blue-400/10 rounded-2xl border border-white/70 hover:border-blue-300 dark:border-white/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 min-w-0 text-left transition-all">
                                            <PhaseMovementSummary movements={phase.movements} isPermissive={phase.isPermissive} />
                                            <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-300"><Edit size={12} /> 이동류 편집</span>
                                        </button>
                                    </div>
                                    <button onClick={() => handleRemovePhase(index)} aria-label={`${index + 1}번 현시 삭제`} disabled={isRecordModeActive || phases.length <= 1} className="ml-2 p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full disabled:text-gray-400 dark:disabled:text-gray-500 disabled:bg-transparent disabled:cursor-not-allowed">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center justify-between sm:justify-start gap-3">
                                        <div className="flex flex-col items-center gap-1">
                                            <label htmlFor={`permissive-${index}`} className="text-[11px] dark:text-gray-300">비보호</label>
                                            <input
                                                type="checkbox"
                                                id={`permissive-${index}`}
                                                checked={phase.isPermissive || false}
                                                onChange={() => handleTogglePermissive(index)}
                                                disabled={isRecordModeActive || !phase.movements.some(movement => movement.type === '좌회전')}
                                                className="w-5 h-5 accent-amber-500 disabled:opacity-30"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 dark:text-white">
                                            {editingTime.index === index ? (
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={editingTime.value}
                                                    onChange={(e) => setEditingTime({ ...editingTime, value: e.target.value })}
                                                    onBlur={() => handleSaveTime(index)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTime(index); }}
                                                    className="w-20 text-center font-mono text-xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none"
                                                    autoFocus
                                                />
                                            ) : (
                                                <>
                                                    <span className="font-mono text-xl font-bold" onClick={() => handleEditTimeClick(index, latestTime)}>
                                                        {isCurrentlyTiming ? timer.elapsed.toFixed(1) : latestTime.toFixed(1)}
                                                    </span>
                                                    <span className="text-xs text-gray-400">초</span>
                                                    <button 
                                                        onClick={() => handleEditTimeClick(index, latestTime)} 
                                                        disabled={isRecordModeActive || timer.active}
                                                        aria-label={`${index + 1}번 현시 시간 직접 수정`}
                                                        className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:text-gray-500 disabled:cursor-not-allowed"
                                                    >
                                                        <Edit size={14} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                        {phase.times.length > 1 && 
                                            <div className="text-xs text-gray-500 dark:text-gray-400 pb-1 flex items-center gap-1">
                                                <History size={12}/>
                                                <span>이전: {phase.times[phase.times.length - 2]}s</span>
                                            </div>
                                        }
                                    </div>
                                    <div className="flex items-center justify-center sm:justify-end gap-2 flex-wrap">
                                        <button onClick={() => handleIndividualTimerToggle(index)} 
                                            className={`w-24 p-2 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${isRecordModeActive || (timer.active && !isCurrentlyTiming) ? 'bg-gray-400 cursor-not-allowed' : (isCurrentlyTiming ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600')}`}
                                            disabled={isRecordModeActive || (timer.active && !isCurrentlyTiming)}
                                        >
                                            {isCurrentlyTiming ? <Square size={16}/> : <Play size={16}/>}
                                            <span>{isCurrentlyTiming ? '중지' : '시작'}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )})}
                    </div>
                    <div className="mt-3">
                        <button onClick={handleAddPhase} disabled={isRecordModeActive} className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-blue-300 dark:border-blue-400/30 rounded-2xl text-blue-600 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-400/5 hover:bg-blue-100/70 dark:hover:bg-blue-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            <Plus size={18} />
                            현시 추가 (현재 {phases.length}개 · 제한 없음)
                        </button>
                    </div>
                    <div className="mt-5 border-t dark:border-gray-700 pt-4">
                         <h3 className="text-lg font-semibold text-center mb-3 dark:text-white">연속 시간 기록 모드</h3>
                         <button 
                            onClick={isRecordModeActive ? handleRecordAndNext : handleToggleRecordMode}
                            disabled={timer.active && !isRecordModeActive}
                            className={`soft-button w-full p-4 text-white font-bold text-lg flex items-center justify-center gap-3 ${isRecordModeActive ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} disabled:bg-gray-400 disabled:cursor-not-allowed`}
                        >
                            {isRecordModeActive ? (
                                <>
                                    <Square size={20} />
                                    <span>{currentRecordingPhaseIndex + 1}번 현시 기록 및 다음</span>
                                </>
                            ) : (
                                <>
                                    <Play size={20} />
                                    <span>시간 기록 모드 시작</span>
                                </>
                            )}
                        </button>
                        {isRecordModeActive && 
                             <button onClick={handleToggleRecordMode} className="w-full mt-2 p-2 rounded-lg bg-gray-600 hover:bg-gray-700 text-white font-semibold">
                                 기록 모드 정지
                             </button>
                        }
                    </div>
                </div>
            </section>
            
            <section className="mt-8">
                 <h2 className="text-xl font-semibold mb-3 flex items-center gap-2 dark:text-white"><StickyNote size={24} className="text-yellow-500" /> 현장 메모</h2>
                 <div className="content-surface p-4">
                    <textarea 
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                        placeholder="현장 특이사항, 주변 여건 등 자유롭게 메모하세요..."
                        className="w-full h-40 p-4 border border-white/70 dark:border-white/10 rounded-3xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white/55 dark:bg-white/5 dark:text-white"
                    ></textarea>
               </div>
            </section>
            
            <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-3xl rounded-[1.4rem] border border-white/70 dark:border-white/10 bg-white/80 dark:bg-[#151922]/92 p-2 shadow-[0_16px_45px_rgba(30,64,175,0.24)] backdrop-blur-xl">
                <button onClick={handleSaveAll} disabled={isSaving || isSavingLocation} className="soft-button w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-3 px-4 hover:bg-indigo-700 disabled:bg-gray-400">
                    <Save size={20} />
                    {isSaving ? '저장 중...' : isDirty ? '모든 변경사항 저장 · 변경됨' : '모든 변경사항 저장'}
                </button>
            </div>
        </div>
    );
};

export const ProjectIntersectionMap = ({ intersections, onSelect }) => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const locatedIntersections = useMemo(() => intersections.filter(intersection => (
        Number.isFinite(intersection.location?.lat) && Number.isFinite(intersection.location?.lng)
    )), [intersections]);

    useEffect(() => {
        if (!mapContainerRef.current || !isGoogleMapsApiKeyConfigured || locatedIntersections.length === 0) return undefined;

        let cancelled = false;
        loadGoogleMapsScript(() => {
            if (cancelled || !mapContainerRef.current) return;

            const map = new window.google.maps.Map(mapContainerRef.current, {
                center: locatedIntersections[0].location,
                zoom: 16,
                disableDefaultUI: true,
                zoomControl: true,
                fullscreenControl: true,
                gestureHandling: 'cooperative',
                mapTypeId: 'roadmap',
            });
            const bounds = new window.google.maps.LatLngBounds();

            markersRef.current = locatedIntersections.map(intersection => {
                bounds.extend(intersection.location);
                const marker = new window.google.maps.Marker({
                    position: intersection.location,
                    map,
                    title: `${intersection.number}. ${intersection.name}`,
                    label: {
                        text: String(intersection.number),
                        color: '#ffffff',
                        fontSize: '13px',
                        fontWeight: '700',
                    },
                    icon: {
                        path: window.google.maps.SymbolPath.CIRCLE,
                        scale: 18,
                        fillColor: '#2563eb',
                        fillOpacity: 0.95,
                        strokeColor: '#ffffff',
                        strokeWeight: 3,
                    },
                });
                marker.addListener('click', () => onSelect(intersection));
                return marker;
            });

            if (locatedIntersections.length === 1) {
                map.setCenter(locatedIntersections[0].location);
                map.setZoom(16);
            } else {
                map.fitBounds(bounds, 52);
            }
            mapRef.current = map;
        });

        return () => {
            cancelled = true;
            markersRef.current.forEach(marker => marker.setMap(null));
            markersRef.current = [];
            mapRef.current = null;
        };
    }, [locatedIntersections, onSelect]);

    return (
        <section className="content-surface overflow-hidden mb-4" aria-label="프로젝트 교차로 위치 지도">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/60 dark:border-white/10">
                <div>
                    <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><MapPin size={18} className="text-blue-600" /> 교차로 위치 지도</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">번호 표지를 누르면 해당 교차로로 이동합니다.</p>
                </div>
                <span className="flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-400/15 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">위치 {locatedIntersections.length}/{intersections.length}</span>
            </div>
            {locatedIntersections.length > 0 ? (
                <div ref={mapContainerRef} className="w-full h-64 sm:h-72 bg-slate-200 dark:bg-slate-800" aria-label="등록된 교차로 지도" />
            ) : (
                <div className="h-40 flex flex-col items-center justify-center gap-2 px-6 text-center bg-white/35 dark:bg-white/[0.03] text-gray-500 dark:text-gray-400">
                    <MapPin size={26} className="text-gray-400" />
                    <p className="text-sm font-medium">저장된 교차로 위치가 없습니다.</p>
                    <p className="text-xs">교차로 상세 화면에서 위치를 저장하면 이 지도에 번호로 표시됩니다.</p>
                </div>
            )}
        </section>
    );
};

export const IntersectionList = ({ intersections, onSelect, onAdd, onDelete, onEdit, onBack }) => {
    const [editingId, setEditingId] = useState(null);
    const [editingNumber, setEditingNumber] = useState('');
    const [editingName, setEditingName] = useState('');
    const [swipedId, setSwipedId] = useState(null);
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);
    const itemRefs = useRef({});

    const handleTouchStart = (id, e) => {
        // Reset all other swipes
        Object.keys(itemRefs.current).forEach(key => {
            if (key !== id && itemRefs.current[key]) {
                itemRefs.current[key].style.transform = '';
            }
        });
        touchStartX.current = e.targetTouches[0].clientX;
        touchEndX.current = touchStartX.current;
        if (swipedId !== id) setSwipedId(null);
    }

    const handleTouchMove = (id, e) => {
        touchEndX.current = e.targetTouches[0].clientX;
        const diff = touchEndX.current - touchStartX.current;
        const target = itemRefs.current[id];
        if (!target) return;
        
        // Swipe left to reveal options
        if (diff < 0) {
            if (diff < -4 && swipedId !== id) setSwipedId(id);
            target.style.transform = `translateX(${Math.max(diff, -128)}px)`;
        } 
        // Prevent swiping right past the origin
        else if (diff > 0 && target.style.transform !== '') {
            target.style.transform = `translateX(${Math.min(diff - 128, 0)}px)`;
        }
    }

    const handleTouchEnd = (id) => {
        const diff = touchEndX.current - touchStartX.current;
        const target = itemRefs.current[id];
        if (!target) return;

        if (diff < -50) { // Swipe left
            target.style.transform = 'translateX(-128px)';
            setSwipedId(id);
        } else { // Swipe back
            target.style.transform = '';
            if (swipedId === id) {
                setSwipedId(null);
            }
        }
    }

    const startEditing = (intersection) => {
        setEditingId(intersection.id);
        setEditingNumber(String(intersection.number));
        setEditingName(intersection.name);
    };
    const cancelEditing = () => setEditingId(null);
    const handleSave = (id) => {
        onEdit(id, editingNumber, editingName);
        cancelEditing();
    };

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-4xl">
            <header className="mb-6">
                <div className="relative h-8 z-10">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2">
                        <button onClick={onBack} className="glass-toolbar flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-white/10 transition-all">
                            <ArrowLeft size={20} />
                            프로젝트
                        </button>
                    </div>
                </div>
                <div className="text-center -mt-8">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">교차로 목록</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">조사할 교차로를 선택하거나 추가하세요.</p>
                </div>
            </header>
            <ProjectIntersectionMap intersections={intersections} onSelect={onSelect} />
            <div className="mb-4">
                <button onClick={onAdd} className="soft-button flex items-center justify-center gap-2 w-full sm:w-auto bg-blue-600 text-white font-semibold py-2.5 px-5 hover:bg-blue-700">
                    <Plus size={20} /> 교차로 추가
                </button>
            </div>
            <div className="content-surface overflow-hidden">
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {intersections.length === 0 ? (
                        <li className="p-6 text-center text-gray-500 dark:text-gray-400">'교차로 추가' 버튼을 눌러 첫 교차로를 등록하세요.</li>
                    ) : (
                        intersections.map(intersection => (
                            <li key={intersection.id} className="relative overflow-hidden">
                                <div className={`absolute top-0 right-0 h-full flex items-center transition-opacity ${swipedId === intersection.id ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} aria-hidden={swipedId !== intersection.id}>
                                    <button tabIndex={swipedId === intersection.id ? 0 : -1} onClick={() => startEditing(intersection)} aria-label={`${intersection.name} 편집`} className="h-full w-16 flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500"><Edit size={20} /></button>
                                    <button tabIndex={swipedId === intersection.id ? 0 : -1} onClick={() => onDelete(intersection.id)} aria-label={`${intersection.name} 삭제`} className="h-full w-16 flex items-center justify-center bg-red-500 text-white hover:bg-red-600"><Trash2 size={20} /></button>
                                </div>
                                <div 
                                    ref={el => itemRefs.current[intersection.id] = el}
                                    className="relative z-10 bg-white/95 dark:bg-[#202631]/95 transition-transform duration-300"
                                    onTouchStart={(e) => handleTouchStart(intersection.id, e)} onTouchMove={(e) => handleTouchMove(intersection.id, e)} onTouchEnd={() => handleTouchEnd(intersection.id)}
                                >
                                    <div className="p-2 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        {editingId === intersection.id ? (
                                            <div className="flex flex-col sm:flex-row items-center gap-4 p-2">
                                                <input type="number" value={editingNumber} onChange={(e) => setEditingNumber(e.target.value)} className="w-20 px-2 py-1 border border-blue-400 rounded-md bg-white dark:bg-gray-700 dark:text-white" autoFocus />
                                                <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} className="flex-grow px-2 py-1 border border-blue-400 rounded-md bg-white dark:bg-gray-700 dark:text-white" />
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => handleSave(intersection.id)} className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full"><Save size={20} /></button>
                                                    <button onClick={cancelEditing} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"><X size={20} /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-4 cursor-pointer" onClick={() => onSelect(intersection)}>
                                                <div className="flex-shrink-0 w-12 h-12 bg-blue-100/80 dark:bg-blue-400/15 text-blue-700 dark:text-blue-300 font-bold rounded-2xl flex items-center justify-center text-lg">{intersection.number}</div>
                                                <div className="flex-grow">
                                                    <p className="font-semibold text-lg text-gray-800 dark:text-gray-200">{intersection.name}</p>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">클릭하여 상세 정보 보기</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </li>
                        ))
                    )}
                </ul>
            </div>
        </div>
    );
};

const ProjectList = ({ projects, onSelect, onAdd, onDelete, onEdit, onMove }) => {
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [swipedId, setSwipedId] = useState(null);
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);
    const itemRefs = useRef({});

    const handleTouchStart = (id, e) => {
       Object.keys(itemRefs.current).forEach(key => {
            if (key !== id && itemRefs.current[key]) {
                itemRefs.current[key].style.transform = '';
            }
        });
        touchStartX.current = e.targetTouches[0].clientX;
        touchEndX.current = touchStartX.current;
        if (swipedId !== id) setSwipedId(null);
    }

    const handleTouchMove = (id, e) => {
        touchEndX.current = e.targetTouches[0].clientX;
        const diff = touchEndX.current - touchStartX.current;
        const target = itemRefs.current[id];
        if (!target) return;

        if (diff < 0) {
            if (diff < -4 && swipedId !== id) setSwipedId(id);
            target.style.transform = `translateX(${Math.max(diff, -128)}px)`;
        } else if (diff > 0 && target.style.transform !== '') {
            target.style.transform = `translateX(${Math.min(diff - 128, 0)}px)`;
        }
    }

    const handleTouchEnd = (id) => {
        const diff = touchEndX.current - touchStartX.current;
        const target = itemRefs.current[id];
        if (!target) return;

        if (diff < -50) {
            target.style.transform = 'translateX(-128px)';
            setSwipedId(id);
        } else {
            target.style.transform = '';
            if (swipedId === id) setSwipedId(null);
        }
    }

    const startEditing = (project) => {
        setEditingId(project.id);
        setEditingName(project.name);
    };
    const cancelEditing = () => {
        setEditingId(null);
        setEditingName('');
    };
    const handleSave = (id) => {
        if (editingName.trim()) {
            onEdit(id, editingName.trim());
            cancelEditing();
        } else {
            showAlert("프로젝트 이름은 비워둘 수 없습니다.");
        }
    };

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-4xl">
            <header className="mb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">프로젝트</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">프로젝트를 선택하거나 새로 만드세요.</p>
            </header>
            <div className="mb-4">
                <button onClick={onAdd} className="soft-button flex items-center justify-center gap-2 w-full sm:w-auto bg-blue-600 text-white font-semibold py-2.5 px-5 hover:bg-blue-700">
                    <Plus size={20} /> 새 프로젝트 추가
                </button>
            </div>
            <div className="content-surface overflow-hidden">
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {projects.length === 0 ? (
                        <li className="p-6 text-center text-gray-500 dark:text-gray-400">'새 프로젝트 추가' 버튼을 눌러 시작하세요.</li>
                    ) : (
                        projects.map((project, index) => (
                            <li key={project.id} className="relative overflow-hidden">
                                <div className={`absolute top-0 right-0 h-full flex items-center transition-opacity ${swipedId === project.id ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} aria-hidden={swipedId !== project.id}>
                                    <button tabIndex={swipedId === project.id ? 0 : -1} onClick={() => startEditing(project)} aria-label={`${project.name} 편집`} className="h-full w-16 flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500"><Edit size={20} /></button>
                                    <button tabIndex={swipedId === project.id ? 0 : -1} onClick={() => onDelete(project.id)} aria-label={`${project.name} 삭제`} className="h-full w-16 flex items-center justify-center bg-red-500 text-white hover:bg-red-600"><Trash2 size={20} /></button>
                                </div>
                                <div 
                                    ref={el => itemRefs.current[project.id] = el}
                                    className="relative z-10 bg-white/95 dark:bg-[#202631]/95 transition-transform duration-300"
                                    onTouchStart={(e) => handleTouchStart(project.id, e)} onTouchMove={(e) => handleTouchMove(project.id, e)} onTouchEnd={() => handleTouchEnd(project.id)}
                                >
                                    <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        {editingId === project.id ? (
                                            <div className="flex items-center gap-4">
                                                <Folder size={24} className="text-blue-500 flex-shrink-0" />
                                                <input 
                                                    type="text" 
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    className="flex-grow px-2 py-1 border border-blue-400 rounded-md bg-white dark:bg-gray-700 dark:text-white"
                                                    autoFocus
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSave(project.id)}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => handleSave(project.id)} className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full"><Save size={20} /></button>
                                                    <button onClick={cancelEditing} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"><X size={20} /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-4">
                                                <div className="flex-grow flex items-center gap-4 cursor-pointer" onClick={() => onSelect(project.id)}>
                                                    <Folder size={24} className="text-blue-500 flex-shrink-0" />
                                                    <div className="flex-grow">
                                                        <p className="font-semibold text-lg text-gray-800 dark:text-gray-200">{project.name}</p>
                                                        <p className="text-sm text-gray-500 dark:text-gray-400">생성일: {project.createdAt?.toDate ? new Date(project.createdAt.toDate()).toLocaleDateString() : '날짜 정보 없음'}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); onMove(index, 'up'); }} disabled={index === 0} className="p-2 text-gray-500 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"><ArrowUp size={18} /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); onMove(index, 'down'); }} disabled={index === projects.length - 1} className="p-2 text-gray-500 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"><ArrowDown size={18} /></button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </li>
                        ))
                    )}
                </ul>
            </div>
        </div>
    );
};


// --- App Container ---
export default function App() {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Navigation state
    const [projects, setProjects] = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState(null);
    const [intersections, setIntersections] = useState([]);
    const [selectedIntersection, setSelectedIntersection] = useState(null);
    const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);
    
    // Settings State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    
    const [view, setView] = useState('projects'); // 'projects', 'intersections', 'detail'

    useEffect(() => {
        const savedDarkMode = localStorage.getItem('darkMode') === 'true';
        setIsDarkMode(savedDarkMode);
    }, []);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('darkMode', isDarkMode);
    }, [isDarkMode]);

    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestoreDb);
            setAuth(firebaseAuth);
            setLogLevel(process.env.NODE_ENV === 'development' ? 'warn' : 'error');
        } catch (e) {
            console.error("Firebase Initialization Error:", e);
            setError('앱 초기화 실패: ' + e.message);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!auth) return;
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (authError) { 
                    console.error("Authentication Error:", authError);
                    setError('인증 실패: ' + authError.message); 
                }
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [auth]);


    // Fetch Projects
    useEffect(() => {
        if (!db || !userId) return;
        const collectionPath = `/artifacts/${appId}/users/${userId}/projects`;
        const q = query(collection(db, collectionPath), orderBy("order", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProjects(data);
        }, (err) => {
            console.error("Firestore Projects Error:", err);
            setError('프로젝트 로딩 실패: ' + err.message);
        });
        return () => unsubscribe();
    }, [db, userId]);

    // Fetch Intersections for selected project
    useEffect(() => {
        if (!db || !userId || !selectedProjectId) {
            setIntersections([]);
            return;
        }
        const collectionPath = `/artifacts/${appId}/users/${userId}/projects/${selectedProjectId}/intersections`;
        const q = query(collection(db, collectionPath), orderBy("number", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setIntersections(data);
        }, (err) => {
            console.error("Firestore Intersections Error:", err);
            setError('교차로 로딩 실패: ' + err.message);
        });
        return () => unsubscribe();
    }, [db, userId, selectedProjectId]);
    
    const backToProjects = useCallback(() => {
        setSelectedProjectId(null);
        setSelectedIntersection(null); // Clean up state
        setView('projects');
    }, []);

    // --- Project Handlers ---
    const handleAddProject = async (projectName) => {
        if (projectName && db && userId) {
            const collectionPath = `/artifacts/${appId}/users/${userId}/projects`;
            await addDoc(collection(db, collectionPath), {
                name: projectName,
                createdAt: new Date(),
                order: projects.length > 0 ? Math.max(...projects.map(p => p.order)) + 1 : 0
            });
            setIsAddProjectModalOpen(false);
        }
    };

    const handleMoveProject = async (index, direction) => {
        if (!db || !userId) return;
        const newProjects = [...projects];
        const a = index;
        const b = direction === 'up' ? index - 1 : index + 1;

        if (b < 0 || b >= newProjects.length) return;

        // Swap order values
        const tempOrder = newProjects[a].order;
        newProjects[a].order = newProjects[b].order;
        newProjects[b].order = tempOrder;

        const batch = writeBatch(db);
        const projectA_Ref = doc(db, `/artifacts/${appId}/users/${userId}/projects`, newProjects[a].id);
        const projectB_Ref = doc(db, `/artifacts/${appId}/users/${userId}/projects`, newProjects[b].id);
        
        batch.update(projectA_Ref, { order: newProjects[a].order });
        batch.update(projectB_Ref, { order: newProjects[b].order });

        await batch.commit();
    };

    const handleEditProject = async (projectId, newName) => {
        if (!db || !userId) return;
        const docRef = doc(db, `/artifacts/${appId}/users/${userId}/projects`, projectId);
        await updateDoc(docRef, { name: newName });
    };

    const handleDeleteProject = useCallback(async (projectId, skipConfirm = false) => {
        if (!db || !userId) return;
        
        const deleteLogic = async () => {
            const intersectionsPath = `/artifacts/${appId}/users/${userId}/projects/${projectId}/intersections`;
            const intersectionsSnapshot = await getDocs(collection(db, intersectionsPath));
            const batch = writeBatch(db);
            intersectionsSnapshot.docs.forEach(d => batch.delete(d.ref));
            
            const projectDocPath = doc(db, `/artifacts/${appId}/users/${userId}/projects`, projectId);
            batch.delete(projectDocPath);

            await batch.commit();

            if (selectedProjectId === projectId) {
                backToProjects();
            }
        };

        if (skipConfirm) {
            await deleteLogic();
        } else {
            showConfirm('정말로 이 프로젝트를 삭제하시겠습니까? 모든 교차로 데이터가 영구적으로 삭제됩니다.', deleteLogic, null, () => {});
        }
    }, [db, userId, selectedProjectId, backToProjects]);

    // --- Intersection Handlers ---
    const handleAddIntersection = async () => {
        if (!db || !userId || !selectedProjectId) return;
        const maxNumber = intersections.reduce((max, p) => p.number > max ? p.number : max, 0);
        const collectionPath = `/artifacts/${appId}/users/${userId}/projects/${selectedProjectId}/intersections`;
        await addDoc(collection(db, collectionPath), {
            number: maxNumber + 1,
            name: `새 교차로 ${maxNumber + 1}`,
            createdAt: new Date(),
            phases: Array.from({ length: 4 }, () => ({ movements: [], times: [], isPermissive: false })),
            directions: DEFAULT_DIRECTIONS,
            location: null,
            mapIcons: {},
            memo: ''
        });
    };

    const handleDeleteIntersection = async (id) => {
        if (!db || !userId || !selectedProjectId) return;
        showConfirm('정말로 이 교차로를 삭제하시겠습니까?', async () => {
            const docPath = `/artifacts/${appId}/users/${userId}/projects/${selectedProjectId}/intersections/${id}`;
            await deleteDoc(doc(db, docPath));
        }, null, () => {});
    };

    const handleEditIntersection = async (id, number, name) => {
        if (!db || !userId || !selectedProjectId) return;
        const newNumber = parseInt(number, 10);
        if (isNaN(newNumber) || name.trim() === '') {
            showAlert('유효한 번호와 이름을 입력하세요.');
            return;
        }
        const docRef = doc(db, `/artifacts/${appId}/users/${userId}/projects/${selectedProjectId}/intersections`, id);
        await updateDoc(docRef, { number: newNumber, name: name.trim() });
    };

    // --- Settings Handlers ---
    const handleResetApp = useCallback(() => {
        if (!db || !userId || !projects) return;
        showConfirm('앱의 모든 데이터를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.', async () => {
            for (const project of projects) {
                await handleDeleteProject(project.id, true); // Pass true to skip confirmation
            }
            showAlert('모든 데이터가 초기화되었습니다.');
        }, null, () => {});
    }, [db, userId, projects, handleDeleteProject]);

    // --- Navigation Handlers ---
    const selectProject = (id) => {
        setSelectedProjectId(id);
        setView('intersections');
    }

    const selectIntersection = useCallback((intersection) => {
        setSelectedIntersection(intersection);
        setView('detail');
    }, []);

    const backToIntersections = useCallback(() => {
        setSelectedIntersection(null);
        setView('intersections');
    }, []);

    // --- Render Logic ---
    if (loading) return <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900 dark:text-gray-300">Loading...</div>;
    if (error) return <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900 text-red-500">{error}</div>;
    
    return (
        <div className="app-shell font-sans text-gray-800 dark:text-gray-200">
            <AddProjectModal
                isOpen={isAddProjectModalOpen}
                onClose={() => setIsAddProjectModalOpen(false)}
                onSave={handleAddProject}
                initialName={`프로젝트 ${projects.length + 1}`}
            />
            <SettingsModal 
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                isDarkMode={isDarkMode}
                onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
                onBackup={() => { setIsSettingsOpen(false); setIsExportModalOpen(true); }}
                onReset={handleResetApp}
            />
            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                projects={projects}
                db={db}
                userId={userId}
                appId={appId}
            />
            <div className="absolute top-4 right-4 z-40">
                <button onClick={() => setIsSettingsOpen(true)} aria-label="설정 열기" className="glass-toolbar p-3 hover:bg-white/80 dark:hover:bg-white/10 transition-all">
                    <Settings size={24} />
                </button>
            </div>

            <main className="pb-20">
                {view === 'projects' && (
                    <ProjectList
                        projects={projects}
                        onSelect={selectProject}
                        onAdd={() => setIsAddProjectModalOpen(true)}
                        onDelete={handleDeleteProject}
                        onEdit={handleEditProject}
                        onMove={handleMoveProject}
                    />
                )}
                {view === 'intersections' && (
                     <IntersectionList
                        intersections={intersections}
                        onSelect={selectIntersection}
                        onAdd={handleAddIntersection}
                        onDelete={handleDeleteIntersection}
                        onEdit={handleEditIntersection}
                        onBack={backToProjects}
                    />
                )}
                {view === 'detail' && selectedIntersection && (
                    <IntersectionDetail
                        intersection={selectedIntersection}
                        db={db}
                        userId={userId}
                        appId={appId}
                        projectId={selectedProjectId}
                        onBack={backToIntersections}
                    />
                )}
            </main>
            
            {view !== 'detail' && (
                <footer className="mx-auto w-[calc(100%-1.5rem)] max-w-2xl text-center px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                    Created by NYH · v2.0.0
                </footer>
            )}
        </div>
    );
}
