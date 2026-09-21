/* global __firebase_config, __app_id, __initial_auth_token */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import * as XLSX from 'xlsx';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, setLogLevel, getDocs, writeBatch, orderBy } from 'firebase/firestore';
import { Plus, Trash2, Save, X, ArrowLeft, MapPin, Edit, Timer, Play, Square, AlertTriangle, History, Crosshair, Satellite, StickyNote, Folder, Settings, Moon, Sun, Download, RefreshCw, ArrowUp, ArrowDown, ChevronDown, ChevronUp, CheckCircle, SlidersHorizontal, Volume2, Smartphone, MoreHorizontal, LockKeyhole } from 'lucide-react';
import { REGION_PROVINCES, getRegionDistricts, getRegionPoint } from './regions';

// --- IMPORTANT: Google Maps API Key ---
// Using a placeholder key. Replace with your actual Google Maps API key.
const GOOGLE_MAPS_API_KEY = 'AIzaSyBNuLXPG9x36nEEKotOMjaDn8tnPV_Net4';
const isGoogleMapsApiKeyConfigured = Boolean(
    GOOGLE_MAPS_API_KEY && !GOOGLE_MAPS_API_KEY.includes('YOUR_GOOGLE_MAPS_API_KEY')
);

export const OverflowingName = ({ children, className = '' }) => {
    const text = String(children ?? '');
    const containerRef = useRef(null);
    const textRef = useRef(null);
    const [marquee, setMarquee] = useState({ active: false, distance: 0, duration: 12 });

    useEffect(() => {
        const container = containerRef.current;
        const node = textRef.current;
        if (!container || !node) return undefined;

        const measure = () => {
            const availableWidth = container.clientWidth;
            if (!availableWidth) return;

            const computed = window.getComputedStyle(node);
            const probe = node.cloneNode(true);
            probe.className = node.className.replace('overflowing-name__track', 'overflowing-name__clamp');
            Object.assign(probe.style, {
                position: 'fixed',
                left: '-10000px',
                top: '0',
                visibility: 'hidden',
                pointerEvents: 'none',
                animation: 'none',
                transform: 'none',
                display: 'block',
                overflow: 'visible',
                width: `${availableWidth}px`,
                maxHeight: 'none',
                WebkitLineClamp: 'unset',
                whiteSpace: 'normal',
                fontFamily: computed.fontFamily,
                fontSize: computed.fontSize,
                fontWeight: computed.fontWeight,
                letterSpacing: computed.letterSpacing,
                lineHeight: computed.lineHeight,
            });
            document.body.appendChild(probe);

            const fontSize = parseFloat(computed.fontSize) || 18;
            const parsedLineHeight = parseFloat(computed.lineHeight);
            const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.45;
            const exceedsTwoLines = probe.scrollHeight > lineHeight * 2 + 1;

            probe.style.width = 'max-content';
            probe.style.whiteSpace = 'nowrap';
            const fullWidth = Math.ceil(probe.getBoundingClientRect().width);
            probe.remove();

            const distance = Math.max(0, fullWidth - availableWidth);
            const active = exceedsTwoLines && distance > 0;
            const duration = Math.max(12, Math.min(32, distance / 22 + 8));
            setMarquee(previous => (
                previous.active === active && previous.distance === distance && previous.duration === duration
                    ? previous
                    : { active, distance, duration }
            ));
        };

        measure();
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
        observer?.observe(container);
        window.addEventListener('resize', measure);
        document.fonts?.ready?.then(measure).catch(() => {});
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [text]);

    return (
        <div ref={containerRef} className={`overflowing-name ${className}`} title={text}>
            <span
                ref={textRef}
                className={marquee.active ? 'overflowing-name__track' : 'overflowing-name__clamp'}
                style={marquee.active ? {
                    '--marquee-distance': `${marquee.distance}px`,
                    '--marquee-duration': `${marquee.duration}s`,
                } : undefined}
            >
                {text}
            </span>
        </div>
    );
};

export const isEdgeBackSwipe = (start, end) => Boolean(
    start
    && end
    && start.x <= 36
    && end.x - start.x >= 72
    && Math.abs(end.y - start.y) <= 60
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

const createFirestore = (firebaseApp) => {
    try {
        return initializeFirestore(firebaseApp, {
            localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        });
    } catch (error) {
        console.warn('Persistent offline cache unavailable; using the default Firestore cache.', error);
        return getFirestore(firebaseApp);
    }
};


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
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
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

export const normalizeDirections = (savedDirections, directionsInUse = []) => {
    const configuredDirections = Array.isArray(savedDirections) && savedDirections.length >= 3
        ? savedDirections
        : DEFAULT_DIRECTIONS;
    return ALL_DIRECTIONS.filter(direction => configuredDirections.includes(direction) || directionsInUse.includes(direction));
};

export const formatSavedAt = (value) => {
    if (!value) return '아직 저장되지 않음';
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '저장 시각 알 수 없음';
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date);
};

export const getIntersectionStatus = (intersection = {}) => {
    const hasIdentity = Number.isFinite(Number(intersection.number)) && String(intersection.name || '').trim().length > 0;
    const hasLocation = Number.isFinite(intersection.location?.lat) && Number.isFinite(intersection.location?.lng);
    const phases = Array.isArray(intersection.phases) ? intersection.phases : [];
    const hasCompletePhases = phases.length > 0 && phases.every(phase => {
        const times = Array.isArray(phase.times) ? phase.times : [];
        return times.length > 0 && Number.isFinite(Number(times[times.length - 1])) && Number(times[times.length - 1]) > 0;
    });
    return hasIdentity && hasLocation && hasCompletePhases ? '조사완료' : '조사필요';
};

export const areCoordinatesEqual = (left, right, tolerance = 0.0000001) => {
    if (!left || !right) return left === right;
    return Math.abs(Number(left.lat) - Number(right.lat)) <= tolerance
        && Math.abs(Number(left.lng) - Number(right.lng)) <= tolerance;
};

export const areMapIconsEqual = (left = {}, right = {}) => {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length
        && leftKeys.every((key, index) => key === rightKeys[index] && areCoordinatesEqual(left[key], right[key]));
};

export const showToast = (message, tone = 'success') => {
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.className = `app-toast fixed left-1/2 z-[70] w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl px-4 py-2 text-center text-sm font-semibold text-white shadow-xl backdrop-blur-xl ${tone === 'error' ? 'bg-red-600/95' : 'bg-slate-900/90'}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2200);
};

export const reattachMapMarker = (marker, map, position) => {
    marker.setPosition(position);
    marker.setMap(map);
};

const approachOffsets = {
    SB: [1, 0], SWB: [1, 1], WB: [0, 1], NWB: [-1, 1],
    NB: [-1, 0], NEB: [-1, -1], EB: [0, -1], SEB: [1, -1],
};

export const getApproachMarkerPosition = (center, direction, distanceMeters = 55) => {
    const offset = approachOffsets[direction];
    if (!center || !offset || !Number.isFinite(Number(center.lat)) || !Number.isFinite(Number(center.lng))) return null;
    const [north, east] = offset;
    const scale = distanceMeters / Math.hypot(north, east);
    const latitude = Number(center.lat);
    return {
        lat: latitude + north * scale / 111320,
        lng: Number(center.lng) + east * scale / (111320 * Math.max(0.01, Math.cos(latitude * Math.PI / 180))),
    };
};

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
        // 특수 교차로에서는 같은 방향·이동류가 중복될 수 있으므로 유효성만 확인하고 원본 순서를 보존합니다.
        return phase.movements.filter(movement => (
            MOVEMENT_DIRECTIONS.includes(movement?.direction) && MOVEMENT_TYPES.includes(movement?.type)
        ));
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

export const buildWorkbookData = (projects = [], intersectionsData = {}, selectedProjects = {}) => {
    const selected = projects.filter(project => selectedProjects[project.id]);
    const projectRows = selected.map(project => ({
        프로젝트ID: project.id,
        프로젝트명: project.name,
        생성일시: formatSavedAt(project.createdAt),
    }));
    const intersectionRows = [];
    const phaseRows = [];
    const observationRows = [];
    const movementRows = [];

    selected.forEach(project => {
        (intersectionsData[project.id] || []).forEach(intersection => {
            intersectionRows.push({
                프로젝트ID: project.id,
                프로젝트명: project.name,
                교차로ID: intersection.id,
                교차로번호: intersection.number,
                교차로명: intersection.name,
                조사자: intersection.surveyor || '',
                조사일시: intersection.surveyedAt || '',
                조사상태: getIntersectionStatus(intersection),
                교차로지수: (intersection.directions || DEFAULT_DIRECTIONS).length,
                위도: intersection.location?.lat ?? '',
                경도: intersection.location?.lng ?? '',
                방향: (intersection.directions || DEFAULT_DIRECTIONS).join(', '),
                현장메모: intersection.memo || '',
                마지막저장: formatSavedAt(intersection.savedAt),
            });
            (intersection.phases || []).forEach((phase, phaseIndex) => {
                const times = Array.isArray(phase.times) ? phase.times : [];
                phaseRows.push({
                    교차로ID: intersection.id,
                    현시번호: phaseIndex + 1,
                    최종시간초: times.length ? times[times.length - 1] : '',
                    비보호좌회전: phase.isPermissive ? 'Y' : 'N',
                    이동류요약: formatPhaseMovements(normalizePhaseMovements(phase)),
                });
                times.forEach((seconds, observationIndex) => observationRows.push({
                    교차로ID: intersection.id,
                    현시번호: phaseIndex + 1,
                    측정순번: observationIndex + 1,
                    시간초: seconds,
                }));
                normalizePhaseMovements(phase).forEach((movement, movementIndex) => movementRows.push({
                    교차로ID: intersection.id,
                    현시번호: phaseIndex + 1,
                    이동류순번: movementIndex + 1,
                    방향: movement.direction,
                    이동류: movement.type,
                }));
            });
        });
    });
    return {
        프로젝트: projectRows,
        교차로: intersectionRows,
        현시: phaseRows,
        시간관측: observationRows,
        이동류: movementRows,
        코드북: [
            { 필드: '조사상태', 설명: '교차로명·번호·위치·모든 현시시간이 있으면 조사완료' },
            { 필드: '비보호좌회전', 설명: 'Y=비보호, N=보호 또는 해당 없음' },
            { 필드: '시간초', 설명: '현시별 각 측정값을 한 행으로 분리' },
        ],
    };
};

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const currentLocalDateTime = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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
    const [isImporting, setIsImporting] = useState(false);
    const importInputRef = useRef(null);

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

    const handleXlsxExport = () => {
        const tables = buildWorkbookData(projects, intersectionsData, selectedProjects);
        if (!tables.프로젝트.length) {
            showAlert("내보낼 프로젝트를 선택해주세요.");
            return;
        }
        const workbook = XLSX.utils.book_new();
        Object.entries(tables).forEach(([sheetName, rows]) => {
            const worksheet = XLSX.utils.json_to_sheet(rows);
            worksheet['!cols'] = Object.keys(rows[0] || {}).map(key => ({ wch: Math.max(12, key.length * 2 + 2) }));
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
        });
        XLSX.writeFile(workbook, `신호현시조사_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('XLSX 파일을 만들었습니다.');
    };

    const handleJsonBackup = () => {
        const selected = projects.filter(project => selectedProjects[project.id]);
        if (!selected.length) {
            showAlert("백업할 프로젝트를 선택해주세요.");
            return;
        }
        const backup = {
            schemaVersion: 1,
            appVersion: '2.0.0',
            exportedAt: new Date().toISOString(),
            projects: selected.map(project => ({ ...project, intersections: intersectionsData[project.id] || [] })),
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `신호현시조사_백업_${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        showToast('JSON 전체 백업을 만들었습니다.');
    };

    const handlePdfPreview = () => {
        const selected = projects.filter(project => selectedProjects[project.id]);
        if (!selected.length) {
            showAlert("보고서 시안을 볼 프로젝트를 선택해주세요.");
            return;
        }
        const sections = selected.flatMap(project => (intersectionsData[project.id] || []).map(intersection => {
            const phases = (intersection.phases || []).map((phase, index) => `
                <tr><td>P${index + 1}</td><td>${escapeHtml(formatPhaseMovements(normalizePhaseMovements(phase)))}</td><td>${escapeHtml(phase.times?.at(-1) ?? '-')}</td><td>${phase.isPermissive ? '비보호' : '-'}</td></tr>`).join('');
            return `<section class="page"><div class="eyebrow">${escapeHtml(project.name)} · ${escapeHtml(getIntersectionStatus(intersection))}</div><h1>${escapeHtml(intersection.number)}. ${escapeHtml(intersection.name)}</h1><div class="meta"><span>${(intersection.directions || DEFAULT_DIRECTIONS).length}지 교차로</span><span>조사자 ${escapeHtml(intersection.surveyor || '미입력')}</span><span>${escapeHtml(intersection.surveyedAt || formatSavedAt(intersection.savedAt))}</span><span>${escapeHtml(intersection.location ? `${intersection.location.lat.toFixed(6)}, ${intersection.location.lng.toFixed(6)}` : '위치 미입력')}</span></div><div class="map">교차로 위치 지도 영역<div>${escapeHtml((intersection.directions || DEFAULT_DIRECTIONS).join(' · '))}</div></div><table><thead><tr><th>현시</th><th>이동류 구성</th><th>시간(초)</th><th>비고</th></tr></thead><tbody>${phases || '<tr><td colspan="4">현시 정보 없음</td></tr>'}</tbody></table><div class="memo"><b>현장 메모</b><p>${escapeHtml(intersection.memo || '기록 없음')}</p></div><footer>신호 현시 현장조사 · v2.0.0 · ${escapeHtml(new Date().toLocaleString('ko-KR'))}</footer></section>`;
        })).join('');
        const preview = window.open('', '_blank');
        if (!preview) {
            showAlert('보고서 시안 창을 열 수 없습니다. 팝업 차단을 확인해주세요.');
            return;
        }
        preview.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>신호현시조사 PDF 보고서 시안</title><style>body{margin:0;background:#e9eef7;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif;color:#152033}.page{box-sizing:border-box;width:210mm;min-height:297mm;margin:20px auto;padding:18mm;background:#fff;box-shadow:0 20px 60px #23395d22;page-break-after:always}.eyebrow{color:#2563eb;font-weight:700;font-size:12px;letter-spacing:.04em}h1{font-size:28px;margin:8px 0 10px}.meta{display:flex;gap:8px;flex-wrap:wrap}.meta span{padding:7px 10px;border-radius:999px;background:#eef4ff;font-size:11px}.map{height:86mm;margin:18px 0;border-radius:22px;background:linear-gradient(135deg,#e9f2ff,#d9e8f5);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#54708e;font-weight:700}.map div{margin-top:9px;font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#162a46;color:white;text-align:left}th,td{padding:10px;border-bottom:1px solid #e5eaf1}.memo{margin-top:18px;padding:14px;border-radius:16px;background:#f7f9fc;font-size:12px}.memo p{margin:6px 0 0;white-space:pre-wrap}footer{margin-top:22px;color:#8995a6;font-size:10px;text-align:right}@media print{body{background:white}.page{margin:0;box-shadow:none}}</style></head><body>${sections || '<section class="page"><h1>교차로 정보 없음</h1></section>'}</body></html>`);
        preview.document.close();
    };

    const handleJsonImport = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setIsImporting(true);
        try {
            const backup = JSON.parse(await file.text());
            if (backup?.schemaVersion !== 1 || !Array.isArray(backup.projects)) throw new Error('지원하지 않는 백업 형식입니다.');
            const projectsPath = `/artifacts/${appId}/users/${userId}/projects`;
            let nextOrder = projects.length ? Math.max(...projects.map(project => Number(project.order) || 0)) + 1 : 0;
            for (const project of backup.projects) {
                const restoredProject = await addDoc(collection(db, projectsPath), {
                    name: `${String(project.name || '복원 프로젝트')} (복원)`,
                    createdAt: new Date(),
                    restoredAt: new Date(),
                    order: nextOrder++,
                });
                const intersectionsPath = `${projectsPath}/${restoredProject.id}/intersections`;
                for (const intersection of (project.intersections || [])) {
                    await addDoc(collection(db, intersectionsPath), {
                        number: Number(intersection.number) || 1,
                        name: String(intersection.name || '복원 교차로'),
                        createdAt: new Date(),
                        location: intersection.location || null,
                        mapIcons: intersection.mapIcons || {},
                        memo: String(intersection.memo || ''),
                        surveyor: String(intersection.surveyor || ''),
                        surveyedAt: String(intersection.surveyedAt || currentLocalDateTime()),
                        phases: Array.isArray(intersection.phases) ? intersection.phases : Array.from({ length: 4 }, () => ({ movements: [], times: [], isPermissive: false })),
                        directions: Array.isArray(intersection.directions) ? intersection.directions : DEFAULT_DIRECTIONS,
                        savedAt: new Date(),
                        restoredAt: new Date(),
                    });
                }
            }
            showToast(`${backup.projects.length}개 프로젝트를 새 항목으로 복원했습니다.`);
            onClose();
        } catch (error) {
            console.error('JSON restore failed:', error);
            showAlert(`백업 복원 실패: ${error.message}`);
        } finally {
            setIsImporting(false);
        }
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
                <div className="mt-5 grid gap-2">
                    <button onClick={handleXlsxExport} disabled={isLoading} className="min-h-11 rounded-2xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400">XLSX로 내보내기</button>
                    <button onClick={handlePdfPreview} disabled={isLoading} className="min-h-11 rounded-2xl bg-slate-800 px-4 py-2 font-semibold text-white hover:bg-slate-900 disabled:bg-gray-400">PDF 보고서 시안 보기</button>
                    <button onClick={handleJsonBackup} disabled={isLoading} className="min-h-11 rounded-2xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-400">JSON 전체 백업</button>
                    <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleJsonImport} className="hidden" />
                    <button onClick={() => importInputRef.current?.click()} disabled={isLoading || isImporting} className="min-h-11 rounded-2xl bg-emerald-50 px-4 py-2 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:bg-gray-200 dark:bg-emerald-400/10 dark:text-emerald-300">{isImporting ? '백업 복원 중…' : 'JSON 백업 가져오기'}</button>
                    <button onClick={handleExport} disabled={isLoading} className="min-h-11 rounded-2xl bg-white/60 px-4 py-2 font-semibold text-gray-700 hover:bg-white dark:bg-white/5 dark:text-gray-200">CSV 호환 파일</button>
                    <button onClick={onClose} className="min-h-11 rounded-2xl px-4 py-2 font-semibold text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5">닫기</button>
                </div>
            </div>
        </div>
    )
};

export const SettingsModal = ({ isOpen, onClose, isDarkMode, onToggleDarkMode, vibrationEnabled, soundEnabled, onToggleVibration, onToggleSound, canInstall, isInstalled, isIos, onInstall, onBackup, onReset }) => {
    if (!isOpen) return null;

    return (
        <div className="glass-backdrop fixed inset-0 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="glass-modal max-h-[calc(100vh-2rem)] w-full max-w-sm overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
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
                    <button onClick={onToggleVibration} className="min-h-12 w-full flex items-center justify-between p-3 bg-white/55 dark:bg-white/5 rounded-2xl hover:bg-white/80 dark:hover:bg-white/10">
                        <span className="flex items-center gap-3 font-semibold dark:text-gray-200"><Smartphone size={20}/> 기록 진동</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${vibrationEnabled ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>{vibrationEnabled ? '켜짐' : '꺼짐'}</span>
                    </button>
                    <button onClick={onToggleSound} className="min-h-12 w-full flex items-center justify-between p-3 bg-white/55 dark:bg-white/5 rounded-2xl hover:bg-white/80 dark:hover:bg-white/10">
                        <span className="flex items-center gap-3 font-semibold dark:text-gray-200"><Volume2 size={20}/> 기록 효과음</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${soundEnabled ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>{soundEnabled ? '켜짐' : '꺼짐'}</span>
                    </button>
                    <section aria-label="홈 화면 앱 설치 안내" className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4 text-left dark:border-blue-400/20 dark:bg-blue-400/10">
                        <div className="mb-2 flex items-center gap-2 font-bold text-blue-800 dark:text-blue-200">
                            <Smartphone size={20}/> 홈 화면에 앱 설치
                        </div>
                        {isInstalled ? (
                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">이 기기에 앱으로 설치되어 있습니다.</p>
                        ) : canInstall ? (
                            <>
                                <p className="mb-3 text-sm leading-6 text-blue-900/80 dark:text-blue-100/80">아래 버튼을 누르면 일반 앱처럼 홈 화면에서 실행할 수 있습니다.</p>
                                <button onClick={onInstall} className="min-h-12 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700">
                                    지금 설치하기
                                </button>
                            </>
                        ) : isIos ? (
                            <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-blue-900/85 dark:text-blue-100/85">
                                <li>이 페이지를 <strong>Safari</strong>에서 엽니다.</li>
                                <li>Safari의 <strong>공유</strong> 버튼을 누릅니다.</li>
                                <li><strong>홈 화면에 추가</strong> → <strong>추가</strong>를 누릅니다.</li>
                            </ol>
                        ) : (
                            <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-blue-900/85 dark:text-blue-100/85">
                                <li>Chrome 또는 Edge의 오른쪽 위 <strong>메뉴(⋮)</strong>를 누릅니다.</li>
                                <li><strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 누릅니다.</li>
                                <li>표시되는 설치 창에서 <strong>설치</strong>를 누릅니다.</li>
                            </ol>
                        )}
                        {!isInstalled && <p className="mt-2 text-xs leading-5 text-blue-700/75 dark:text-blue-200/70">설치가 끝나면 홈 화면의 ‘신호현시조사’ 아이콘으로 실행하세요.</p>}
                    </section>
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
    const directionPositions = {
        SB: 'left-1/2 top-0 -translate-x-1/2',
        SWB: 'right-[7%] top-[7%]',
        WB: 'right-0 top-1/2 -translate-y-1/2',
        NWB: 'right-[7%] bottom-[7%]',
        NB: 'bottom-0 left-1/2 -translate-x-1/2',
        NEB: 'bottom-[7%] left-[7%]',
        EB: 'left-0 top-1/2 -translate-y-1/2',
        SEB: 'left-[7%] top-[7%]',
    };

    const toggleDirection = (direction) => {
        const isSelected = selectedDirections.includes(direction);
        if (isSelected && (usedDirections.includes(direction) || selectedDirections.length <= 3)) return;
        setSelectedDirections(isSelected
            ? selectedDirections.filter(item => item !== direction)
            : [...selectedDirections, direction]);
    };

    const orderedDirections = ALL_DIRECTIONS.filter(direction => selectedDirections.includes(direction));

    return (
        <div className="glass-backdrop fixed inset-0 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="glass-modal max-h-[92vh] w-full max-w-lg overflow-y-auto p-5 sm:p-6" onClick={event => event.stopPropagation()}>
                <h3 className="text-lg font-bold dark:text-white">교차로 방향 설정</h3>
                <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">실제 접근로 방향만 켜세요. 기본 방향도 끌 수 있어 3지 교차로를 표현할 수 있습니다.</p>
                <div className="relative mx-auto mt-4 aspect-square w-full max-w-[20rem]" role="group" aria-label="나침반형 교차로 방향 선택">
                    <div className="absolute inset-[32%] flex flex-col items-center justify-center rounded-full border border-white/80 bg-white/65 text-center shadow-inner backdrop-blur-md dark:border-white/10 dark:bg-white/5">
                        <strong className="text-2xl text-blue-700 dark:text-blue-300">{selectedDirections.length}지</strong>
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">교차로</span>
                    </div>
                    {ALL_DIRECTIONS.map(direction => {
                        const selected = selectedDirections.includes(direction);
                        const inUse = usedDirections.includes(direction);
                        const minimumReached = selected && selectedDirections.length <= 3;
                        return (
                            <button
                                key={direction}
                                type="button"
                                aria-pressed={selected}
                                aria-label={`${direction} 방향 ${selected ? '끄기' : '켜기'}`}
                                disabled={selected && (inUse || minimumReached)}
                                onClick={() => toggleDirection(direction)}
                                className={`absolute ${directionPositions[direction]} flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${selected ? 'border-blue-400 bg-blue-100/90 text-blue-700 shadow-md dark:bg-blue-400/20 dark:text-blue-200' : 'border-dashed border-gray-300 bg-white/35 text-gray-400 opacity-40 grayscale dark:border-gray-600 dark:bg-white/[0.03] dark:text-gray-500'} disabled:cursor-not-allowed`}
                            >
                                <MovementArrowIcon direction={direction} type="직진" className="h-7 w-7" />
                                <span className="text-xs font-bold">{direction}</span>
                                {inUse && <span className="text-[9px] leading-none">사용 중</span>}
                            </button>
                        );
                    })}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />활성</span>
                    <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-600" />비활성</span>
                    <span>최소 3개 방향</span>
                </div>
                <div className="mt-3 rounded-2xl bg-white/55 p-3 text-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">활성 방향 {orderedDirections.length}개: <strong>{orderedDirections.join(' · ')}</strong></div>
                {usedDirections.some(direction => selectedDirections.includes(direction)) && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">‘사용 중’ 방향은 현시와 지도 방향표시에서 먼저 해제해야 끌 수 있습니다.</p>}
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

export const IntersectionDetail = ({ intersection, db, userId, appId, onBack, projectId, vibrationEnabled, soundEnabled }) => {
    const [details, setDetails] = useState(null);
    const [map, setMap] = useState(null);
    const [mapCenter, setMapCenter] = useState(null); // Confirmed intersection location, not the browsing viewport.
    const [mapTypeId, setMapTypeId] = useState('roadmap');
    const [isRegionPickerOpen, setIsRegionPickerOpen] = useState(false);
    const [regionProvince, setRegionProvince] = useState('');
    const [regionDistrict, setRegionDistrict] = useState('');
    const [isLocationEditing, setIsLocationEditing] = useState(false);
    const [isLocationSaving, setIsLocationSaving] = useState(false);
    const mapContainerRef = useRef(null);
    const [isSaving, setIsSaving] = useState(false);
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
    const [surveyor, setSurveyor] = useState('');
    const [surveyedAt, setSurveyedAt] = useState(currentLocalDateTime);
    const markersRef = useRef({});
    const mainMarkerRef = useRef(null); // Fixed at the confirmed intersection location.
    const [isDirty, setIsDirty] = useState(false);
    const initialData = useRef(null);
    const [isLocationVisible, setIsLocationVisible] = useState(true);
    const [spatialSaveState, setSpatialSaveState] = useState('saved');
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const wakeLockRef = useRef(null);
    const hydratedRef = useRef(false);
    const spatialSaveTimerRef = useRef(null);
    const lastSyncedSpatialRef = useRef({ location: null, mapIcons: {} });
    const spatialSaveVersionRef = useRef(0);

    useEffect(() => {
        if (!isLocationVisible) {
            setIsLocationEditing(false);
            setIsRegionPickerOpen(false);
        }
    }, [isLocationVisible]);
    const hasDetails = Boolean(details);

    const docRef = useMemo(() => doc(db, `/artifacts/${appId}/users/${userId}/projects/${projectId}/intersections`, intersection.id), [db, appId, userId, projectId, intersection.id]);
    const draftKey = useMemo(() => `signal-app-draft:${userId}:${projectId}:${intersection.id}`, [userId, projectId, intersection.id]);

    const provideTimerFeedback = useCallback(() => {
        if (vibrationEnabled && navigator.vibrate) navigator.vibrate(45);
        if (!soundEnabled) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            const context = new AudioContextClass();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = 880;
            gain.gain.setValueAtTime(0.0001, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.1);
            oscillator.addEventListener('ended', () => context.close());
        } catch (error) {
            console.warn('Timer sound is unavailable:', error);
        }
    }, [soundEnabled, vibrationEnabled]);

    const handleSaveAll = async () => {
        setIsSaving(true);
        try {
            const savedAt = new Date();
            const dataToSave = {
                location: mapCenter, // Save the current map center
                mapIcons: mapIcons,
                memo: memo,
                surveyor,
                surveyedAt,
                phases: phases,
                directions: directions,
                savedAt,
                updatedAt: savedAt,
                surveyStatus: getIntersectionStatus({ ...details, location: mapCenter, phases }),
            };
            await updateDoc(docRef, dataToSave);
            
            initialData.current = {
                location: mapCenter,
                mapIcons: mapIcons,
                memo: memo,
                surveyor,
                surveyedAt,
                phases: phases,
                directions: directions,
            };
            setIsDirty(false);
            setLastSavedAt(savedAt);
            localStorage.removeItem(draftKey);
            showToast(navigator.onLine ? "모든 변경사항을 저장했습니다." : "기기에 저장했습니다. 연결되면 자동 동기화됩니다.");
        } catch (error) {
            console.error("Failed to save data:", error);
            showToast("저장에 실패했습니다.", 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleBack = () => {
        if (isDirty) {
            showConfirm(
                "저장하지 않은 변경사항이 있습니다. 저장하시겠습니까?",
                () => { handleSaveAll().then(onBack) }, // Save and go back
                () => { localStorage.removeItem(draftKey); onBack(); }, // Don't save and go back
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
                setLastSavedAt(data.savedAt || null);
                const remoteLocation = data.location || null;
                const remoteMapIcons = data.mapIcons || {};
                lastSyncedSpatialRef.current = { location: remoteLocation, mapIcons: remoteMapIcons };
                setMapCenter(previous => areCoordinatesEqual(previous, remoteLocation) ? previous : remoteLocation);
                setMapIcons(previous => areMapIconsEqual(previous, remoteMapIcons) ? previous : remoteMapIcons);
                const validPhases = (data.phases && Array.isArray(data.phases) && data.phases.length > 0 ? data.phases : Array.from({ length: 4 }, () => ({ movements: [], times: [], isPermissive: false }))).map(p => ({
                    movements: normalizePhaseMovements(p),
                    times: Array.isArray(p.times) ? p.times : [],
                    isPermissive: p.isPermissive || false
                }));
                const directionsInUse = [
                    ...validPhases.flatMap(phase => phase.movements.map(movement => movement.direction)),
                    ...Object.keys(data.mapIcons || {})
                ];
                const validDirections = normalizeDirections(data.directions, directionsInUse);
                
                const initialSnapshot = { 
                    location: data.location, 
                    mapIcons: data.mapIcons || {}, 
                    memo: data.memo || '',
                    surveyor: data.surveyor || '',
                    surveyedAt: data.surveyedAt || currentLocalDateTime(),
                    phases: validPhases,
                    directions: validDirections,
                };
                if (!initialData.current) {
                    initialData.current = initialSnapshot;
                    let draft = null;
                    try { draft = JSON.parse(localStorage.getItem(draftKey)); } catch (error) { localStorage.removeItem(draftKey); }
                    const serverSavedAt = data.savedAt?.toDate ? data.savedAt.toDate().getTime() : new Date(data.savedAt || 0).getTime();
                    const shouldRestoreDraft = draft && Number(draft.updatedAt) > serverSavedAt;
                    setMemo(shouldRestoreDraft ? draft.memo : (data.memo || ''));
                    setSurveyor(shouldRestoreDraft ? (draft.surveyor || '') : (data.surveyor || ''));
                    setSurveyedAt(shouldRestoreDraft ? (draft.surveyedAt || currentLocalDateTime()) : (data.surveyedAt || currentLocalDateTime()));
                    setPhases(shouldRestoreDraft ? draft.phases : validPhases);
                    setDirections(shouldRestoreDraft ? draft.directions : validDirections);
                    if (shouldRestoreDraft) showToast('저장 전 현장 기록을 복구했습니다.');
                }
                hydratedRef.current = true;
            } else {
                console.warn(`Intersection document (${docRef.path}) no longer exists. Navigating back.`);
                showAlert("교차로 데이터가 삭제되었거나 찾을 수 없습니다. 목록으로 돌아갑니다.");
                onBack();
            }
        });
        return () => unsub();
    }, [docRef, draftKey, onBack]);

    useEffect(() => {
        if (!hydratedRef.current || !initialData.current) return;
        const hasDraftChanges = initialData.current.memo !== memo
            || initialData.current.surveyor !== surveyor
            || initialData.current.surveyedAt !== surveyedAt
            || JSON.stringify(initialData.current.phases) !== JSON.stringify(phases)
            || JSON.stringify(initialData.current.directions) !== JSON.stringify(directions);
        if (hasDraftChanges) {
            localStorage.setItem(draftKey, JSON.stringify({ memo, surveyor, surveyedAt, phases, directions, updatedAt: Date.now() }));
        }
    }, [draftKey, memo, surveyor, surveyedAt, phases, directions]);

    useEffect(() => {
        if (!hydratedRef.current || !mapCenter || isLocationSaving) return undefined;
        const lastSynced = lastSyncedSpatialRef.current;
        if (areCoordinatesEqual(lastSynced.location, mapCenter) && areMapIconsEqual(lastSynced.mapIcons, mapIcons)) {
            return undefined;
        }
        const saveVersion = ++spatialSaveVersionRef.current;
        setSpatialSaveState('saving');
        if (spatialSaveTimerRef.current) window.clearTimeout(spatialSaveTimerRef.current);
        spatialSaveTimerRef.current = window.setTimeout(() => {
            const spatialUpdatedAt = new Date();
            const pendingWrite = updateDoc(docRef, { location: mapCenter, mapIcons, spatialUpdatedAt });
            if (!navigator.onLine && saveVersion === spatialSaveVersionRef.current) {
                lastSyncedSpatialRef.current = { location: mapCenter, mapIcons };
                if (initialData.current) {
                    initialData.current.location = mapCenter;
                    initialData.current.mapIcons = mapIcons;
                }
                setSpatialSaveState('offline');
            }
            pendingWrite.then(() => {
                if (saveVersion !== spatialSaveVersionRef.current) return;
                lastSyncedSpatialRef.current = { location: mapCenter, mapIcons };
                if (initialData.current) {
                    initialData.current.location = mapCenter;
                    initialData.current.mapIcons = mapIcons;
                }
                setSpatialSaveState('saved');
            }).catch(error => {
                if (saveVersion !== spatialSaveVersionRef.current) return;
                console.error('Failed to save spatial data:', error);
                setSpatialSaveState('error');
            });
        }, 650);
        return () => window.clearTimeout(spatialSaveTimerRef.current);
    }, [docRef, mapCenter, mapIcons, isLocationSaving]);

    useEffect(() => {
        if (initialData.current) {
            const memoChanged = initialData.current.memo !== memo;
            const surveyorChanged = initialData.current.surveyor !== surveyor;
            const surveyedAtChanged = initialData.current.surveyedAt !== surveyedAt;
            const phasesChanged = JSON.stringify(initialData.current.phases) !== JSON.stringify(phases);
            const directionsChanged = JSON.stringify(initialData.current.directions) !== JSON.stringify(directions);
            setIsDirty(memoChanged || surveyorChanged || surveyedAtChanged || phasesChanged || directionsChanged);
        }
    }, [mapCenter, mapIcons, memo, surveyor, surveyedAt, phases, directions]);

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
        let cancelled = false;
        const syncWakeLock = async () => {
            if (!timer.active || !('wakeLock' in navigator)) return;
            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                if (cancelled && wakeLockRef.current) await wakeLockRef.current.release();
            } catch (error) {
                console.warn('Screen wake lock is unavailable:', error);
            }
        };
        syncWakeLock();
        return () => {
            cancelled = true;
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => {});
                wakeLockRef.current = null;
            }
        };
    }, [timer.active]);

    useEffect(() => {
        const mapContainer = mapContainerRef.current;
        if (!hasDetails || !mapContainer || !isLocationVisible || !isGoogleMapsApiKeyConfigured) return;
    
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

            if (mapCenter) {
                mainMarkerRef.current = new window.google.maps.Marker({
                    position: mapCenter,
                    map: gMap,
                    draggable: false,
                    title: '확정된 교차로 위치',
                    zIndex: 10,
                });
            }

        });
        
        return () => {
            Object.values(markersRef.current).forEach(marker => marker.setMap(null));
            markersRef.current = {};
            if (mainMarkerRef.current) mainMarkerRef.current.setMap(null);
            if (mapContainer) {
                mapContainer.innerHTML = '';
            }
            setMap(null);
            mainMarkerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasDetails, isLocationVisible]);

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
                reattachMapMarker(markersRef.current[dir], map, pos);
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
        if (!map) return;
        if (mapCenter) {
            if (mainMarkerRef.current) mainMarkerRef.current.setPosition(mapCenter);
            else mainMarkerRef.current = new window.google.maps.Marker({
                position: mapCenter,
                map,
                draggable: false,
                title: '확정된 교차로 위치',
                zIndex: 10,
            });
        } else if (mainMarkerRef.current) {
            mainMarkerRef.current.setMap(null);
            mainMarkerRef.current = null;
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
                    map.panTo(newLoc);
                    map.setZoom(17);
                }
                showToast('현재 위치로 이동했습니다. 교차로 위치는 변경되지 않았습니다.');
            }, () => showAlert('현재 위치를 가져올 수 없습니다. 브라우저의 위치 정보 접근 권한을 확인해주세요.'));
        } else {
            showAlert('이 브라우저에서는 위치 정보 기능을 지원하지 않습니다.');
        }
    };

    const handleRegionMove = () => {
        const position = getRegionPoint(regionProvince, regionDistrict);
        if (!map || !position) return;
        setIsRegionPickerOpen(false);
        map.panTo(position);
        map.setZoom(12);
    };

    const handleLocationConfirm = () => {
        const position = map?.getCenter()?.toJSON();
        if (!position) return;
        if (areCoordinatesEqual(position, mapCenter)) {
            setIsLocationEditing(false);
            showToast('저장된 교차로 위치를 유지했습니다.');
            return;
        }
        const previousSpatial = lastSyncedSpatialRef.current;
        const saveVersion = ++spatialSaveVersionRef.current;
        if (spatialSaveTimerRef.current) window.clearTimeout(spatialSaveTimerRef.current);
        lastSyncedSpatialRef.current = { location: position, mapIcons };
        setIsLocationEditing(false);
        setMapCenter(position);
        setIsLocationSaving(navigator.onLine);
        setSpatialSaveState(navigator.onLine ? 'saving' : 'offline');
        const spatialUpdatedAt = new Date();
        updateDoc(docRef, { location: position, mapIcons, spatialUpdatedAt }).then(() => {
            if (saveVersion !== spatialSaveVersionRef.current) return;
            lastSyncedSpatialRef.current = { location: position, mapIcons };
            setMapCenter(previous => areCoordinatesEqual(previous, position) ? previous : position);
            if (initialData.current) {
                initialData.current.location = position;
                initialData.current.mapIcons = mapIcons;
            }
            setSpatialSaveState('saved');
            setIsLocationSaving(false);
        }).catch(error => {
            if (saveVersion !== spatialSaveVersionRef.current) return;
            console.error('Failed to save confirmed location:', error);
            lastSyncedSpatialRef.current = previousSpatial;
            setMapCenter(previousSpatial.location);
            setSpatialSaveState('error');
            setIsLocationSaving(false);
            showToast('교차로 위치를 저장하지 못했습니다. 다시 지정해 주세요.', 'error');
        });
        showToast(navigator.onLine ? '교차로 위치를 저장하는 중입니다.' : '교차로 위치를 기기에 저장했습니다. 연결되면 동기화됩니다.');
    };
    
    const addMapIcon = (dir) => {
        if (!map || mapIcons[dir]) return;
        const position = getApproachMarkerPosition(mapCenter || map.getCenter().toJSON(), dir);
        if (position) setMapIcons(prev => ({ ...prev, [dir]: position }));
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
            provideTimerFeedback();
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
            provideTimerFeedback();
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
        provideTimerFeedback();
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
        <div className="px-3 pb-28 pt-4 sm:p-6 sm:pb-28 lg:p-8 lg:pb-28 max-w-5xl mx-auto">
            {isPhaseModalOpen && editingIndex !== null && <PhaseSelectionModal directions={directions} initialMovements={phases[editingIndex]?.movements || []} isPermissive={phases[editingIndex]?.isPermissive || false} onClose={() => { setIsPhaseModalOpen(false); setEditingIndex(null); }} onSave={handleSavePhaseMovements} />}
            {isDirectionSettingsOpen && <DirectionSettingsModal directions={directions} usedDirections={[...new Set([...phases.flatMap(phase => phase.movements.map(movement => movement.direction)), ...Object.keys(mapIcons)])]} onClose={() => setIsDirectionSettingsOpen(false)} onSave={handleSaveDirections} />}
            <header className="mb-4 sm:mb-6">
                <div className="flex items-center justify-between">
                    <button onClick={handleBack} className="glass-toolbar flex h-12 items-center gap-2 whitespace-nowrap px-3 text-gray-700 transition-all hover:bg-white/80 dark:text-gray-200 dark:hover:bg-white/10"><ArrowLeft size={20} /> 목록으로</button>
                    <div className="h-12 w-12" aria-hidden="true" />
                </div>
                <div className="mx-auto mt-2 flex w-fit max-w-full items-start justify-center gap-1 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl" title={`${details.number}. ${details.name}`}>
                    <span className="flex-shrink-0">{details.number}.</span>
                    <div className="min-w-0" style={{ maxWidth: 'min(70vw, 40rem)' }}>
                        <OverflowingName className="text-left">{details.name}</OverflowingName>
                    </div>
                </div>
            </header>

            <section className="content-surface mb-4 grid gap-3 p-3 sm:grid-cols-2 sm:p-4" aria-label="조사 기본정보">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">조사자
                    <input value={surveyor} onChange={event => setSurveyor(event.target.value)} placeholder="조사자 이름" className="mt-1 min-h-11 w-full rounded-2xl border border-white/70 bg-white/60 px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white" />
                </label>
                <label className="min-w-0 overflow-hidden text-xs font-semibold text-gray-600 dark:text-gray-300">조사 일시
                    <input type="datetime-local" value={surveyedAt} onChange={event => setSurveyedAt(event.target.value)} className="survey-datetime-input mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-2xl border border-white/70 bg-white/60 px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white" />
                </label>
            </section>

            <section className="mb-5 sm:mb-8">
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
                            {isLocationEditing && <div className="pointer-events-none absolute left-1/2 top-1/2 z-[5] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/90 p-2 text-white shadow-[0_0_0_5px_rgba(255,255,255,.9)]" aria-hidden="true"><Crosshair size={24} /></div>}
                            <button type="button" onClick={() => setIsRegionPickerOpen(open => !open)} aria-expanded={isRegionPickerOpen} aria-controls="region-picker" className="absolute left-3 top-3 z-10 flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-slate-800 shadow-lg dark:bg-gray-800 dark:text-white">
                                <MapPin size={17} className="text-blue-600" /> 지역으로 이동 <ChevronDown size={16} />
                            </button>
                            {isRegionPickerOpen && <div id="region-picker" className="region-picker absolute left-3 top-16 z-20 w-[min(18rem,calc(100%-6rem))] space-y-2 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur-lg dark:bg-slate-800/95">
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300" htmlFor="region-province">시·도</label>
                                <select id="region-province" value={regionProvince} onChange={event => { setRegionProvince(event.target.value); setRegionDistrict(''); }} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                                    <option value="">시·도 선택</option>
                                    {REGION_PROVINCES.map(province => <option key={province} value={province}>{province}</option>)}
                                </select>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300" htmlFor="region-district">시·군·구</label>
                                <select id="region-district" value={regionDistrict} disabled={!regionProvince} onChange={event => setRegionDistrict(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                                    <option value="">시·군·구 선택</option>
                                    {getRegionDistricts(regionProvince).map(district => <option key={district} value={district}>{district}</option>)}
                                </select>
                                <button type="button" onClick={handleRegionMove} disabled={!regionDistrict || !map} className="min-h-11 w-full rounded-xl bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-50">지도 이동</button>
                            </div>}
                            <div className="absolute top-3 right-3 flex flex-col gap-2">
                                <button onClick={handleFindMe} title="현재 위치 찾기" aria-label="현재 위치 찾기" className="p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <Crosshair className="text-gray-700 dark:text-gray-300" size={20} />
                                </button>
                                <button onClick={() => setMapTypeId(mapTypeId === 'roadmap' ? 'satellite' : 'roadmap')} title="위성/지도 전환" aria-label="위성/지도 전환" className="p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <Satellite className="text-gray-700 dark:text-gray-300" size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="region-preview mt-3 rounded-2xl bg-blue-50 px-3 py-3 text-xs text-blue-900 dark:bg-blue-950/70 dark:text-blue-100" role="status">
                            <div className="flex items-center gap-2 font-bold"><LockKeyhole size={16} /> {mapCenter ? '교차로 위치 잠금' : '교차로 위치 미지정'}</div>
                            <p className="mt-1">지도 이동·지역 이동·GPS는 저장된 위치를 바꾸지 않습니다. {isLocationEditing ? '파란 조준점을 교차로에 맞춘 뒤 위치를 확정하세요.' : mapCenter ? '빨간 핀이 확정된 위치입니다.' : '위치 지정 버튼을 눌러 교차로를 표시하세요.'}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {isLocationEditing ? <>
                                    <button type="button" onClick={handleLocationConfirm} disabled={!map || isLocationSaving} className="min-h-11 flex-1 rounded-xl bg-blue-600 px-3 font-bold text-white disabled:opacity-50">이 위치로 확정</button>
                                    <button type="button" onClick={() => setIsLocationEditing(false)} className="min-h-11 rounded-xl bg-white px-3 font-semibold text-blue-800 dark:bg-slate-800 dark:text-blue-100">취소</button>
                                </> : <>
                                    <button type="button" onClick={() => setIsLocationEditing(true)} disabled={!map || isLocationSaving} className="min-h-11 flex-1 rounded-xl bg-blue-600 px-3 font-bold text-white disabled:opacity-50">{mapCenter ? '위치 변경' : '위치 지정'}</button>
                                    {mapCenter && <button type="button" onClick={() => { map?.panTo(mapCenter); map?.setZoom(17); }} className="min-h-11 rounded-xl bg-white px-3 font-semibold text-blue-800 dark:bg-slate-800 dark:text-blue-100">저장 위치로 이동</button>}
                                </>}
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
                                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">아이콘은 교차로 중심 기준 접근로 방향에 놓입니다. 드래그해 실제 위치로 옮길 수 있습니다.</p>
                            </div>
                            <div className={`mt-3 flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold ${spatialSaveState === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300' : spatialSaveState === 'offline' ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300' : 'bg-teal-50 text-teal-700 dark:bg-teal-400/10 dark:text-teal-300'}`} role="status">
                                {spatialSaveState === 'saving' ? <RefreshCw size={17} className="animate-spin" /> : spatialSaveState === 'error' || spatialSaveState === 'offline' ? <AlertTriangle size={17} /> : <CheckCircle size={17} />}
                                {spatialSaveState === 'saving' ? '확정 위치·방향 저장 중' : spatialSaveState === 'error' ? '위치·방향 저장 실패 · 다시 시도 필요' : spatialSaveState === 'offline' ? '확정 위치·방향 기기에 저장됨 · 연결 시 동기화' : mapCenter ? '확정 위치·방향 저장 완료' : '교차로 위치 미지정 · 위치 지정 후 저장'}
                            </div>
                        </div>
                    </>
                )}
            </section>
            
            <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-1.5 dark:text-white"><Timer size={21} className="text-green-500" /> 신호 현시 정보</h2>
                    <button type="button" onClick={() => setIsDirectionSettingsOpen(true)} className="glass-toolbar min-h-11 flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-blue-700 dark:text-blue-200 hover:bg-white/80 dark:hover:bg-white/10"><SlidersHorizontal size={16} /> 방향 설정 <span className="text-[11px] opacity-70">{directions.length}</span></button>
                </div>
                <div className="content-surface p-2 sm:p-4">
                    <div className="mb-2 flex justify-between items-center bg-white/55 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2 rounded-xl sm:rounded-2xl">
                        <div className="flex items-baseline gap-1.5"><span className="font-bold text-sm sm:text-base dark:text-white">신호 주기</span><span className="text-[11px] text-gray-500 dark:text-gray-400">{phases.length}현시</span></div>
                        <span className="font-bold text-lg sm:text-xl text-emerald-700 dark:text-emerald-400">{cycleLength}초</span>
                    </div>
                    <div className="space-y-1.5 sm:space-y-2">
                        {phases.map((phase, index) => {
                             const latestTime = phase.times && phase.times.length > 0 ? phase.times[phase.times.length - 1] : 0;
                             const isCurrentlyTiming = timer.active && timer.index === index;
                             const isThisPhaseInRecordMode = isRecordModeActive && currentRecordingPhaseIndex === index;

                            return(
                            <div key={index} className={`phase-card px-2.5 py-2 space-y-1.5 transition-all duration-300 ${isThisPhaseInRecordMode ? 'phase-card-active' : ''}`}>
                                <div className="flex items-center gap-1.5">
                                    <div className="flex items-stretch gap-1.5 flex-grow min-w-0">
                                        <span className="flex-shrink-0 flex items-center justify-center h-11 min-w-11 px-2 rounded-2xl bg-blue-600 text-white font-bold text-sm shadow-sm">P{index + 1}</span>
                                        <button onClick={() => handlePhaseTypeClick(index)} disabled={isRecordModeActive} aria-label={`${index + 1}번 현시 이동류 조합 편집`} title="눌러서 현시 이동류 조합 편집" className="group w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 min-h-11 bg-white/55 dark:bg-white/5 hover:bg-blue-50/90 dark:hover:bg-blue-400/10 rounded-2xl border border-white/70 hover:border-blue-300 dark:border-white/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 min-w-0 text-left transition-all">
                                            <PhaseMovementSummary movements={phase.movements} isPermissive={phase.isPermissive} />
                                            <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-300"><Edit size={14} /><span className="hidden sm:inline">이동류 편집</span></span>
                                        </button>
                                    </div>
                                    <button onClick={() => handleRemovePhase(index)} aria-label={`${index + 1}번 현시 삭제`} disabled={isRecordModeActive || phases.length <= 1} className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full disabled:text-gray-400 dark:disabled:text-gray-500 disabled:bg-transparent disabled:cursor-not-allowed">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-700">
                                        <label htmlFor={`permissive-${index}`} className="min-h-11 px-2 flex items-center gap-1.5 rounded-xl text-[10px] sm:text-[11px] dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/5">
                                            <input
                                                type="checkbox"
                                                id={`permissive-${index}`}
                                                checked={phase.isPermissive || false}
                                                onChange={() => handleTogglePermissive(index)}
                                                disabled={isRecordModeActive || !phase.movements.some(movement => movement.type === '좌회전')}
                                                className="w-5 h-5 accent-amber-500 disabled:opacity-30"
                                            />
                                            <span>비보호</span>
                                        </label>
                                        <div className="min-h-11 flex items-center justify-center gap-1.5 dark:text-white min-w-0">
                                            {editingTime.index === index ? (
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={editingTime.value}
                                                    onChange={(e) => setEditingTime({ ...editingTime, value: e.target.value })}
                                                    onBlur={() => handleSaveTime(index)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTime(index); }}
                                                    className="w-20 text-center font-mono text-lg sm:text-xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none"
                                                    autoFocus
                                                />
                                            ) : (
                                                <>
                                                    <span className="font-mono text-lg sm:text-xl font-bold" onClick={() => handleEditTimeClick(index, latestTime)}>
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
                                        <button onClick={() => handleIndividualTimerToggle(index)} 
                                            className={`min-h-11 min-w-[72px] px-2 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${isRecordModeActive || (timer.active && !isCurrentlyTiming) ? 'bg-gray-400 cursor-not-allowed' : (isCurrentlyTiming ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600')}`}
                                            disabled={isRecordModeActive || (timer.active && !isCurrentlyTiming)}
                                        >
                                            {isCurrentlyTiming ? <Square size={16}/> : <Play size={16}/>}
                                            <span>{isCurrentlyTiming ? '중지' : '시작'}</span>
                                        </button>
                                </div>
                                {phase.times.length > 1 &&
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1 leading-none">
                                        <History size={11}/>
                                        <span>이전 {phase.times[phase.times.length - 2]}초</span>
                                    </div>
                                }
                            </div>
                        )})}
                    </div>
                    <div className="mt-2">
                        <button onClick={handleAddPhase} disabled={isRecordModeActive} className="min-h-11 w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-blue-300 dark:border-blue-400/30 rounded-xl sm:rounded-2xl text-sm text-blue-600 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-400/5 hover:bg-blue-100/70 dark:hover:bg-blue-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            <Plus size={18} />
                            현시 추가 (현재 {phases.length}개 · 제한 없음)
                        </button>
                    </div>
                    <div className="mt-3 border-t dark:border-gray-700 pt-3">
                         <h3 className="text-sm sm:text-base font-semibold text-center mb-2 dark:text-white">연속 시간 기록 모드</h3>
                         <button 
                            onClick={isRecordModeActive ? handleRecordAndNext : handleToggleRecordMode}
                            disabled={timer.active && !isRecordModeActive}
                            className={`soft-button min-h-12 w-full px-4 py-3 text-white font-bold text-base flex items-center justify-center gap-2 ${isRecordModeActive ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} disabled:bg-gray-400 disabled:cursor-not-allowed`}
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
                <div className="mb-1 flex items-center justify-between px-2 text-[11px] text-gray-600 dark:text-gray-300">
                    <span className={`font-bold ${getIntersectionStatus({ ...details, location: mapCenter, phases }) === '조사완료' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-300'}`}>{getIntersectionStatus({ ...details, location: mapCenter, phases })}</span>
                    <span>마지막 저장 {formatSavedAt(lastSavedAt)}</span>
                </div>
                <button onClick={handleSaveAll} disabled={isSaving || isLocationSaving} className="soft-button w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-3 px-4 hover:bg-indigo-700 disabled:bg-gray-400">
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
                const isComplete = getIntersectionStatus(intersection) === '조사완료';
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
                        fillColor: isComplete ? '#059669' : '#d97706',
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
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">번호 표지를 누르면 이동합니다. 초록은 조사완료, 주황은 조사필요입니다.</p>
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

    const toggleActionMenu = (id) => {
        const isOpen = swipedId === id;
        Object.entries(itemRefs.current).forEach(([key, item]) => {
            if (item && (key !== id || isOpen)) item.style.transform = '';
        });
        const target = itemRefs.current[id];
        if (target && !isOpen) target.style.transform = 'translateX(-128px)';
        setSwipedId(isOpen ? null : id);
    };

    const startEditing = (intersection) => {
        const target = itemRefs.current[intersection.id];
        if (target) target.style.transform = '';
        setSwipedId(null);
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
            <header className="mb-4 sm:mb-6">
                <div className="flex h-12 items-center justify-between">
                    <button onClick={onBack} className="glass-toolbar z-10 flex h-12 items-center gap-2 whitespace-nowrap px-3 text-gray-700 transition-all hover:bg-white/80 dark:text-gray-200 dark:hover:bg-white/10">
                        <ArrowLeft size={20} className="flex-shrink-0" />
                        <span>프로젝트</span>
                    </button>
                    <div className="h-12 w-12" aria-hidden="true" />
                </div>
                <h1 className="mt-2 text-center text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">교차로 목록</h1>
                <p className="mt-1 text-center text-sm text-gray-600 dark:text-gray-400">조사할 교차로를 선택하거나 추가하세요.</p>
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
                                            <div className="grid min-w-0 gap-2 p-1 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center sm:p-2">
                                                <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-2 sm:contents">
                                                    <input type="number" aria-label="교차로 번호 편집" value={editingNumber} onChange={(e) => setEditingNumber(e.target.value)} className="min-h-11 w-full min-w-0 rounded-xl border border-blue-400 bg-white px-2 py-1 dark:bg-gray-700 dark:text-white" autoFocus />
                                                    <input type="text" aria-label="교차로명 편집" value={editingName} onChange={(e) => setEditingName(e.target.value)} className="min-h-11 w-full min-w-0 rounded-xl border border-blue-400 bg-white px-2 py-1 dark:bg-gray-700 dark:text-white" />
                                                </div>
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => handleSave(intersection.id)} className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full"><Save size={20} /></button>
                                                    <button onClick={cancelEditing} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"><X size={20} /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex min-w-0 items-center gap-4 cursor-pointer" onClick={() => onSelect(intersection)}>
                                                <div className={`flex-shrink-0 w-12 h-12 font-bold rounded-2xl flex items-center justify-center text-lg ${getIntersectionStatus(intersection) === '조사완료' ? 'bg-emerald-100/90 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' : 'bg-amber-100/90 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300'}`}>{intersection.number}</div>
                                                <div className="min-w-0 flex-grow">
                                                    <OverflowingName className="text-lg font-semibold text-gray-800 dark:text-gray-200">{intersection.name}</OverflowingName>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">{getIntersectionStatus(intersection)} · {intersection.directions?.length || DEFAULT_DIRECTIONS.length}지 교차로</p>
                                                </div>
                                                <button type="button" aria-label={`${intersection.name} 작업 메뉴`} aria-expanded={swipedId === intersection.id} onClick={event => { event.stopPropagation(); toggleActionMenu(intersection.id); }} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"><MoreHorizontal size={22}/></button>
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

export const ProjectList = ({ projects, onSelect, onAdd, onDelete, onEdit, onMove }) => {
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

    const toggleActionMenu = (id) => {
        const isOpen = swipedId === id;
        Object.entries(itemRefs.current).forEach(([key, item]) => {
            if (item && (key !== id || isOpen)) item.style.transform = '';
        });
        const target = itemRefs.current[id];
        if (target && !isOpen) target.style.transform = 'translateX(-128px)';
        setSwipedId(isOpen ? null : id);
    };

    const startEditing = (project) => {
        const target = itemRefs.current[project.id];
        if (target) target.style.transform = '';
        setSwipedId(null);
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
                <div className="grid min-h-12 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2">
                    <div className="h-12 w-12" aria-hidden="true" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">프로젝트</h1>
                    <div className="h-12 w-12" aria-hidden="true" />
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 sm:text-base">프로젝트를 선택하거나 새로 만드세요.</p>
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
                                            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                                                <Folder size={24} className="text-blue-500 flex-shrink-0" />
                                                <input 
                                                    type="text" 
                                                    aria-label="프로젝트명 편집"
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    className="min-h-11 w-full min-w-0 rounded-xl border border-blue-400 bg-white px-2 py-1 dark:bg-gray-700 dark:text-white"
                                                    autoFocus
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSave(project.id)}
                                                />
                                                <div className="flex flex-shrink-0 items-center gap-0.5">
                                                    <button onClick={() => handleSave(project.id)} className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full"><Save size={20} /></button>
                                                    <button onClick={cancelEditing} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"><X size={20} /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-4">
                                                <div className="min-w-0 flex-grow flex items-center gap-4 cursor-pointer" onClick={() => onSelect(project.id)}>
                                                    <Folder size={24} className="text-blue-500 flex-shrink-0" />
                                                    <div className="min-w-0 flex-grow">
                                                        <OverflowingName className="text-lg font-semibold text-gray-800 dark:text-gray-200">{project.name}</OverflowingName>
                                                        <p className="whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">생성일: {project.createdAt?.toDate ? new Date(project.createdAt.toDate()).toLocaleDateString() : '날짜 정보 없음'}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-shrink-0 items-center gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); onMove(index, 'up'); }} disabled={index === 0} className="p-2 text-gray-500 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"><ArrowUp size={18} /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); onMove(index, 'down'); }} disabled={index === projects.length - 1} className="p-2 text-gray-500 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"><ArrowDown size={18} /></button>
                                                    <button type="button" aria-label={`${project.name} 작업 메뉴`} aria-expanded={swipedId === project.id} onClick={event => { event.stopPropagation(); toggleActionMenu(project.id); }} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"><MoreHorizontal size={22}/></button>
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
    const [vibrationEnabled, setVibrationEnabled] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [installPrompt, setInstallPrompt] = useState(null);
    const [isInstalled, setIsInstalled] = useState(() => Boolean(
        window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
    ));
    const [updateRegistration, setUpdateRegistration] = useState(null);
    const edgeSwipeStartRef = useRef(null);
    const isIos = /iPad|iPhone|iPod/i.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    const [view, setView] = useState('projects'); // 'projects', 'intersections', 'detail'
    const [viewMotion, setViewMotion] = useState('forward');

    useEffect(() => {
        const savedDarkMode = localStorage.getItem('darkMode') === 'true';
        setIsDarkMode(savedDarkMode);
        setVibrationEnabled(localStorage.getItem('timerVibration') !== 'false');
        setSoundEnabled(localStorage.getItem('timerSound') !== 'false');
    }, []);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDarkMode ? '#0d1118' : '#eef5ff');
        localStorage.setItem('darkMode', isDarkMode);
    }, [isDarkMode]);

    useEffect(() => {
        const updateConnection = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', updateConnection);
        window.addEventListener('offline', updateConnection);
        return () => {
            window.removeEventListener('online', updateConnection);
            window.removeEventListener('offline', updateConnection);
        };
    }, []);

    useEffect(() => {
        const handleInstallPrompt = event => {
            event.preventDefault();
            setInstallPrompt(event);
        };
        const handleAppInstalled = () => {
            setInstallPrompt(null);
            setIsInstalled(true);
        };
        const handleUpdate = event => setUpdateRegistration(event.detail);
        window.addEventListener('beforeinstallprompt', handleInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);
        window.addEventListener('signal-app-update', handleUpdate);
        return () => {
            window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
            window.removeEventListener('signal-app-update', handleUpdate);
        };
    }, []);

    const handleInstallApp = async () => {
        if (!installPrompt) return;
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
    };

    const handleApplyUpdate = () => {
        const waiting = updateRegistration?.waiting;
        if (!waiting) return;
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        waiting.postMessage('SKIP_WAITING');
    };

    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = createFirestore(app);
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
        setViewMotion('back');
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
            memo: '',
            surveyor: '',
            surveyedAt: currentLocalDateTime(),
            surveyStatus: '조사필요'
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
        setViewMotion('forward');
        setView('intersections');
    }

    const selectIntersection = useCallback((intersection) => {
        setSelectedIntersection(intersection);
        setViewMotion('forward');
        setView('detail');
    }, []);

    const backToIntersections = useCallback(() => {
        setSelectedIntersection(null);
        setViewMotion('back');
        setView('intersections');
    }, []);

    const handleAppTouchStart = useCallback(event => {
        const touch = event.touches?.[0];
        if (!touch || document.querySelector('.glass-backdrop')) {
            edgeSwipeStartRef.current = null;
            return;
        }
        edgeSwipeStartRef.current = touch.clientX <= 36
            ? { x: touch.clientX, y: touch.clientY }
            : null;
    }, []);

    const handleAppTouchEnd = useCallback(event => {
        const start = edgeSwipeStartRef.current;
        edgeSwipeStartRef.current = null;
        const touch = event.changedTouches?.[0];
        if (!touch || !isEdgeBackSwipe(start, { x: touch.clientX, y: touch.clientY })) return;

        if (view === 'detail') {
            backToIntersections();
        } else if (view === 'intersections') {
            backToProjects();
        }
    }, [view, backToIntersections, backToProjects]);

    // --- Render Logic ---
    if (loading) return <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900 dark:text-gray-300">Loading...</div>;
    if (error) return <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900 text-red-500">{error}</div>;
    
    return (
        <div
            className="app-shell font-sans text-gray-800 dark:text-gray-200"
            onTouchStartCapture={handleAppTouchStart}
            onTouchEndCapture={handleAppTouchEnd}
        >
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
                vibrationEnabled={vibrationEnabled}
                soundEnabled={soundEnabled}
                onToggleVibration={() => setVibrationEnabled(value => {
                    const next = !value;
                    localStorage.setItem('timerVibration', String(next));
                    return next;
                })}
                onToggleSound={() => setSoundEnabled(value => {
                    const next = !value;
                    localStorage.setItem('timerSound', String(next));
                    return next;
                })}
                canInstall={Boolean(installPrompt)}
                isInstalled={isInstalled}
                isIos={isIos}
                onInstall={handleInstallApp}
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
            <div className="app-floating-settings absolute right-4 z-40">
                <button onClick={() => setIsSettingsOpen(true)} aria-label="설정 열기" className="glass-toolbar flex h-12 w-12 items-center justify-center p-0 transition-all hover:bg-white/80 dark:hover:bg-white/10">
                    <Settings size={24} />
                </button>
            </div>
            {!isOnline && <div className="app-floating-status fixed left-1/2 z-40 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg" role="status">오프라인 · 기기에 임시 저장</div>}
            {updateRegistration && <div className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-2xl" role="status"><span>새 버전을 사용할 수 있습니다.</span><button onClick={handleApplyUpdate} className="min-h-11 rounded-xl bg-white px-3 font-bold text-slate-900">업데이트</button></div>}

            <main key={view} className={`app-view app-view--${viewMotion} pb-20`}>
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
                        vibrationEnabled={vibrationEnabled}
                        soundEnabled={soundEnabled}
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
