/* global __firebase_config, __app_id, __initial_auth_token */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, setLogLevel, getDocs, writeBatch, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { Plus, Trash2, Save, X, ArrowLeft, MapPin, Edit, Timer, Play, Square, AlertTriangle, History, Compass, Crosshair, Satellite, StickyNote, Folder, Settings, Moon, Sun, Download, RefreshCw, ArrowUp, ArrowDown, Camera, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';

// --- IMPORTANT: Google Maps API Key ---
// Using a placeholder key. Replace with your actual Google Maps API key.
const GOOGLE_MAPS_API_KEY = 'AIzaSyBNuLXPG9x36nEEKotOMjaDn8tnPV_Net4';

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
    modal.className = "fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4";
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm text-center">
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
    modal.className = "fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4";
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm text-center">
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
        script.onload = () => callback();
    } else if (existingScript.getAttribute('data-loaded') === 'true') {
        callback();
    } else {
        existingScript.addEventListener('load', callback);
    }
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
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
        csvContent += "Project Name,Intersection No,Intersection Name,Phase Index,Direction,Type,Final Time (s),Permissive,Photo URL\r\n";
        const dataRows = [];

        projects.forEach(project => {
            if (selectedProjects[project.id]) {
                const intersections = intersectionsData[project.id] || [];
                intersections.forEach(intersection => {
                    if (intersection.phases) {
                        intersection.phases.forEach((phase, index) => {
                            const latestTime = (phase.times && phase.times.length > 0) ? phase.times[phase.times.length - 1] : '';
                            const row = [
                                `"${project.name}"`,
                                intersection.number,
                                `"${intersection.name}"`,
                                index + 1,
                                phase.direction || '',
                                phase.type || '',
                                latestTime,
                                phase.isPermissive ? 'Y' : 'N',
                                intersection.representativePhoto || ''
                            ].join(',');
                            dataRows.push(row);
                        });
                    }
                });
            }
        });

        if (dataRows.length === 0) {
            showAlert("내보낼 데이터가 없습니다. 프로젝트를 선택해주세요.");
            return;
        }
        
        csvContent += dataRows.join("\r\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "signal_data_backup.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold dark:text-white">설정</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300"><X size={20}/></button>
                </div>
                <div className="space-y-4">
                    <button onClick={onToggleDarkMode} className="w-full flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
                        <span className="font-semibold dark:text-gray-200">다크 모드</span>
                        <div className="flex items-center gap-2">
                            {isDarkMode ? <Moon size={20} className="text-yellow-400"/> : <Sun size={20} className="text-orange-500"/>}
                            <div className={`w-12 h-6 rounded-full flex items-center transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-gray-300'}`}>
                                <span className={`inline-block w-5 h-5 bg-white rounded-full transform transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`}></span>
                            </div>
                        </div>
                    </button>
                    <button onClick={onBackup} className="w-full flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-semibold dark:text-gray-200">
                        <Download size={20}/> 데이터 내보내기
                    </button>
                    <button onClick={onReset} className="w-full flex items-center gap-3 p-3 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/80 font-semibold">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
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


const DirectionSelectionModal = ({ onSelect, onClose }) => {
    const directions = ['SB', 'SWB', 'WB', 'NWB', 'NB', 'NEB', 'EB', 'SEB'];
    const positions = [
      { top: '0%', left: '50%', transform: 'translate(-50%, -50%)' },   // Top (SB)
      { top: '15%', left: '15%', transform: 'translate(-50%, -50%)' },  // Top-Left (SWB)
      { top: '50%', left: '0%', transform: 'translate(-50%, -50%)' },    // Left (WB)
      { top: '85%', left: '15%', transform: 'translate(-50%, -50%)' },  // Bottom-Left (NWB)
      { top: '100%', left: '50%', transform: 'translate(-50%, -50%)' }, // Bottom (NB)
      { top: '85%', left: '85%', transform: 'translate(-50%, -50%)' },  // Bottom-Right (NEB)
      { top: '50%', left: '100%', transform: 'translate(-50%, -50%)' }, // Right (EB)
      { top: '15%', left: '85%', transform: 'translate(-50%, -50%)' },  // Top-Right (SEB)
    ];


    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-full shadow-2xl p-8 w-64 h-64 relative" onClick={e => e.stopPropagation()}>
                <div className="absolute inset-0 flex justify-center items-center">
                    <div className="w-full h-px bg-gray-300 dark:bg-gray-600"></div>
                    <div className="w-px h-full bg-gray-300 dark:bg-gray-600 absolute"></div>
                    <div className="w-full h-px bg-gray-300 dark:bg-gray-600 absolute" style={{transform: 'rotate(45deg)'}}></div>
                    <div className="w-full h-px bg-gray-300 dark:bg-gray-600 absolute" style={{transform: 'rotate(-45deg)'}}></div>
                </div>
                {directions.map((dir, index) => (
                    <button
                        key={dir}
                        onClick={() => onSelect(dir)}
                        className="absolute w-12 h-12 bg-blue-500 text-white rounded-full flex justify-center items-center font-bold text-sm hover:bg-blue-700 transition-all duration-200 transform hover:scale-110"
                        style={positions[index]}
                    >
                        {dir}
                    </button>
                ))}
            </div>
        </div>
    );
};

const PhaseSelectionModal = ({ onSelect, onClose }) => {
    const phaseTypes = [
        '직진', '좌회전', '우회전',
        '직좌동시', '양방직진', '양방좌회전',
        '유턴', '적신호시 우회전', '올레드'
    ];
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold mb-4 dark:text-white">현시 종류 선택</h3>
                <div className="grid grid-cols-3 gap-2">
                    {phaseTypes.map(type => (
                        <button key={type} onClick={() => onSelect(type)} className="p-2 bg-gray-100 dark:bg-gray-700 dark:text-gray-200 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-md transition-colors">
                            {type}
                        </button>
                    ))}
                </div>
                <button onClick={onClose} className="mt-6 w-full p-2 bg-gray-200 dark:bg-gray-600 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md font-semibold">닫기</button>
            </div>
        </div>
    );
};

const IntersectionDetail = ({ intersection, db, userId, appId, onBack, projectId }) => {
    const [details, setDetails] = useState(null);
    const [map, setMap] = useState(null);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [mapTypeId, setMapTypeId] = useState('roadmap');
    const searchInputRef = useRef(null);
    const mapContainerRef = useRef(null);
    const [isSaving, setIsSaving] = useState(false);
    const [phases, setPhases] = useState([]);
    const [isPhaseModalOpen, setIsPhaseModalOpen] = useState(false);
    const [isDirectionModalOpen, setIsDirectionModalOpen] = useState(false);
    const [editingIndex, setEditingIndex] = useState(null);
    const [timer, setTimer] = useState({ active: false, index: null, startTime: 0, elapsed: 0 });
    const intervalIdRef = useRef(null);
    const [isRecordModeActive, setIsRecordModeActive] = useState(false);
    const [currentRecordingPhaseIndex, setCurrentRecordingPhaseIndex] = useState(null);
    const [editingTime, setEditingTime] = useState({ index: null, value: '' });
    const [mapIcons, setMapIcons] = useState({});
    const [memo, setMemo] = useState('');
    const markersRef = useRef({});
    const [isDirty, setIsDirty] = useState(false);
    const initialData = useRef(null);
    const [photo, setPhoto] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const [isLocationVisible, setIsLocationVisible] = useState(true);
    const [isPhotoVisible, setIsPhotoVisible] = useState(true); // State for photo visibility

    const docRef = useMemo(() => doc(db, `/artifacts/${appId}/users/${userId}/projects/${projectId}/intersections`, intersection.id), [db, appId, userId, projectId, intersection.id]);

    const handleSaveAll = useCallback(async () => {
        setIsSaving(true);
        try {
            const dataToSave = {
                location: currentLocation,
                mapIcons: mapIcons,
                memo: memo,
                phases: phases,
            };
            await updateDoc(docRef, dataToSave);
            
            initialData.current = {
                location: currentLocation,
                mapIcons: mapIcons,
                memo: memo,
                phases: phases,
            };
            setIsDirty(false);
            showAlert("저장되었습니다.");
        } catch (error) {
            console.error("Failed to save data:", error);
            showAlert("저장에 실패했습니다.");
        } finally {
            setIsSaving(false);
        }
    }, [currentLocation, mapIcons, memo, phases, docRef]);

    const handleBack = useCallback(() => {
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
    }, [isDirty, onBack, handleSaveAll]);

    useEffect(() => {
        const unsub = onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setDetails(data);
                if (data.location) setCurrentLocation(data.location);
                setMapIcons(data.mapIcons || {});
                setMemo(data.memo || '');
                setPhoto(data.representativePhoto || null);
                const validPhases = (data.phases && Array.isArray(data.phases) && data.phases.length > 0 ? data.phases : Array(4).fill({ direction: null, type: null, times: [], isPermissive: false })).map(p => ({
                    direction: p.direction || null,
                    type: p.type || null,
                    times: Array.isArray(p.times) ? p.times : [],
                    isPermissive: p.isPermissive || false
                }));
                setPhases(validPhases);
                
                const initialSnapshot = { 
                    location: data.location, 
                    mapIcons: data.mapIcons || {}, 
                    memo: data.memo || '',
                    phases: validPhases,
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
            const locationChanged = JSON.stringify(initialData.current.location) !== JSON.stringify(currentLocation);
            const iconsChanged = JSON.stringify(initialData.current.mapIcons) !== JSON.stringify(mapIcons);
            const memoChanged = initialData.current.memo !== memo;
            const phasesChanged = JSON.stringify(initialData.current.phases) !== JSON.stringify(phases);
            setIsDirty(locationChanged || iconsChanged || memoChanged || phasesChanged);
        }
    }, [currentLocation, mapIcons, memo, phases]);

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
        if (!details || !mapContainer) return;
    
        loadGoogleMapsScript(() => {
            if (!mapContainerRef.current) return;
            const initialCenter = details.location || { lat: 37.5665, lng: 126.9780 };
            const gMap = new window.google.maps.Map(mapContainerRef.current, {
                center: initialCenter,
                zoom: 17,
                disableDefaultUI: true,
                mapTypeId: mapTypeId
            });
            setMap(gMap);

            const mainMarker = new window.google.maps.Marker({ position: initialCenter, map: gMap, draggable: true, zIndex: 10 });
            mainMarker.addListener('dragend', (e) => setCurrentLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() }));

            if (searchInputRef.current) {
                const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current);
                autocomplete.bindTo('bounds', gMap);
                autocomplete.addListener('place_changed', () => {
                    const place = autocomplete.getPlace();
                    if (place.geometry && place.geometry.location) {
                        const newLoc = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
                        gMap.setCenter(newLoc);
                        mainMarker.setPosition(newLoc);
                        setCurrentLocation(newLoc);
                    }
                });
            }
        });
        
        return () => {
            if (mapContainer) {
                mapContainer.innerHTML = '';
            }
            setMap(null);
        };
    }, [details, mapTypeId]);
    
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
        if (map && currentLocation) {
            map.setCenter(currentLocation);
            const mainMarker = map.markers?.[0];
            if(mainMarker) mainMarker.setPosition(currentLocation);
        }
    }, [map, currentLocation]);

    const handleFindMe = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                const newLoc = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                setCurrentLocation(newLoc);
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

    const handleDirectionClick = (index) => {
        setEditingIndex(index);
        setIsDirectionModalOpen(true);
    };

    const updatePhases = async (newPhases) => {
        setPhases(newPhases);
        await updateDoc(docRef, { phases: newPhases });
    };

    const handleSelectPhaseType = (type) => {
        const newPhases = JSON.parse(JSON.stringify(phases));
        newPhases[editingIndex].type = type;
        updatePhases(newPhases);
        setIsPhaseModalOpen(false);
        setEditingIndex(null);
    };

    const handleSelectDirection = (direction) => {
        const newPhases = JSON.parse(JSON.stringify(phases));
        newPhases[editingIndex].direction = direction;
        updatePhases(newPhases);
        setIsDirectionModalOpen(false);
        setEditingIndex(null);
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
        const newPhases = [...phases, { direction: null, type: null, times: [], isPermissive: false }];
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
    
    const handlePhotoUpload = async (file) => {
        if (!file) return;
        setIsUploading(true);
        const storage = getStorage();

        if (photo) {
            try {
                const oldPhotoRef = ref(storage, photo);
                await deleteObject(oldPhotoRef);
            } catch (error) {
                if (error.code !== 'storage/object-not-found') {
                    console.error("Could not delete old photo, continuing with upload...", error);
                }
            }
        }

        const filePath = `artifacts/${appId}/users/${userId}/projects/${projectId}/${intersection.id}/${Date.now()}-${file.name}`;
        const storageRef = ref(storage, filePath);
        
        try {
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            await updateDoc(docRef, {
                representativePhoto: downloadURL
            });
            setPhoto(downloadURL);
        } catch (error) {
            console.error("Error uploading photo: ", error);
            showAlert("사진 업로드에 실패했습니다.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeletePhoto = async () => {
        if (!photo) return;
        showConfirm("이 사진을 삭제하시겠습니까?", async () => {
            const storage = getStorage();
            const photoRef = ref(storage, photo);
            try {
                await deleteObject(photoRef);
                await updateDoc(docRef, {
                    representativePhoto: null
                });
                setPhoto(null);
            } catch (error) {
                console.error("Error deleting photo: ", error);
                showAlert("사진 삭제에 실패했습니다.");
            }
        }, null, () => {});
    };


    const cycleLength = useMemo(() => {
        return phases.reduce((sum, phase) => {
            const lastTime = phase.times && phase.times.length > 0 ? phase.times[phase.times.length - 1] : 0;
            return sum + lastTime;
        }, 0).toFixed(1);
    }, [phases]);

    if (!details) return <div className="p-6 text-center dark:text-gray-300">교차로 정보를 불러오는 중...</div>;

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            {isPhaseModalOpen && <PhaseSelectionModal onClose={() => setIsPhaseModalOpen(false)} onSelect={handleSelectPhaseType} />}
            {isDirectionModalOpen && <DirectionSelectionModal onClose={() => setIsDirectionModalOpen(false)} onSelect={handleSelectDirection} />}
            <header className="mb-6">
                <div className="flex items-center justify-between">
                    <button onClick={handleBack} className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"><ArrowLeft size={20} /> 목록으로</button>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white text-center mt-2 truncate">{details.number}. {details.name}</h1>
            </header>

            <section className="mb-8">
                 <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xl font-semibold flex items-center gap-2 dark:text-white"><MapPin size={24} className="text-blue-500" /> 교차로 위치</h2>
                    <button onClick={() => setIsLocationVisible(!isLocationVisible)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                        {isLocationVisible ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                    </button>
                </div>
                {isLocationVisible && (
                    <>
                        <div className="relative">
                            <div ref={mapContainerRef} className="w-full h-96 bg-gray-200 dark:bg-gray-700 rounded-lg shadow-md overflow-hidden">
                                {GOOGLE_MAPS_API_KEY.includes('YOUR_GOOGLE') &&
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
                                <button onClick={handleFindMe} title="현재 위치 찾기" className="p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <Crosshair className="text-gray-700 dark:text-gray-300" size={20} />
                                </button>
                                <button onClick={() => setMapTypeId(mapTypeId === 'roadmap' ? 'satellite' : 'roadmap')} title="위성/지도 전환" className="p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <Satellite className="text-gray-700 dark:text-gray-300" size={20} />
                                </button>
                            </div>
                        </div>
                         <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">방향 아이콘 (클릭하여 지도에 추가/삭제)</h3>
                                <div className="flex items-center justify-between gap-4">
                                    {['SB', 'WB', 'NB', 'EB'].map(dir => (
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
                        </div>
                    </>
                )}
            </section>
            
            <section className="mb-8">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xl font-semibold flex items-center gap-2 dark:text-white"><ImageIcon size={24} className="text-purple-500" /> 교차로 사진</h2>
                    <button onClick={() => setIsPhotoVisible(!isPhotoVisible)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                        {isPhotoVisible ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                    </button>
                </div>
                {isPhotoVisible && (
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                        <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-md flex items-center justify-center overflow-hidden relative mb-4">
                            {isUploading ? <p className="dark:text-gray-300">업로드 중...</p> : photo ? (
                                <>
                                    <img src={photo} alt="교차로 대표사진" className="w-full h-full object-cover"/>
                                    <button onClick={handleDeletePhoto} className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-red-600">
                                        <X size={16} />
                                    </button>
                                </>
                            ) : (
                                <div className="text-center text-gray-500 dark:text-gray-400">
                                    <ImageIcon size={48} className="mx-auto"/>
                                    <p>사진 없음</p>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => cameraInputRef.current && cameraInputRef.current.click()} className="flex-1 flex items-center justify-center gap-2 p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                                <Camera size={18}/> 사진 촬영
                            </button>
                            <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={(e) => handlePhotoUpload(e.target.files[0])} className="hidden" />
                            <button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="flex-1 flex items-center justify-center gap-2 p-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 whitespace-nowrap">
                                <ImageIcon size={18}/> 갤러리 선택
                            </button>
                            <input type="file" accept="image/*" ref={fileInputRef} onChange={(e) => handlePhotoUpload(e.target.files[0])} className="hidden" />
                        </div>
                    </div>
                )}
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2 dark:text-white"><Timer size={24} className="text-green-500" /> 신호 현시 정보</h2>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                    <div className="mb-6 flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                        <span className="font-bold text-lg dark:text-white">신호 주기 (Cycle)</span>
                        <span className="font-bold text-2xl text-green-700 dark:text-green-400">{cycleLength} 초</span>
                    </div>
                    <div className="space-y-4">
                        {phases.map((phase, index) => {
                             const latestTime = phase.times && phase.times.length > 0 ? phase.times[phase.times.length - 1] : 0;
                             const isCurrentlyTiming = timer.active && timer.index === index;
                             const isThisPhaseInRecordMode = isRecordModeActive && currentRecordingPhaseIndex === index;

                            return(
                            <div key={index} className={`rounded-lg border p-4 space-y-3 transition-all duration-300 ${isThisPhaseInRecordMode ? 'border-green-500 bg-green-50 dark:bg-green-900/50' : 'border-gray-200 dark:border-gray-700'}`}>
                                <div className="flex justify-between items-center gap-2">
                                    <div className="flex items-center gap-2 flex-grow min-w-0">
                                        <button onClick={() => handleDirectionClick(index)} disabled={isRecordModeActive} className="flex-shrink-0 flex items-center justify-center gap-1 p-2 h-10 w-16 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md disabled:cursor-not-allowed disabled:bg-gray-600 dark:text-gray-200">
                                            <Compass size={16} className="text-gray-600 dark:text-gray-400" />
                                            <span className="font-bold text-sm">{phase.direction || '-'}</span>
                                        </button>
                                        <button onClick={() => handlePhaseTypeClick(index)} disabled={isRecordModeActive} className="flex-grow flex items-center gap-2 p-2 h-10 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md border border-dashed border-gray-300 dark:border-gray-600 disabled:cursor-not-allowed disabled:bg-gray-600 dark:text-gray-200 min-w-0">
                                            <Edit size={16} className="text-gray-400" /><span className="font-medium truncate">{phase.type || '현시 선택'}</span>
                                        </button>
                                    </div>
                                    <button onClick={() => handleRemovePhase(index)} disabled={isRecordModeActive || phases.length <= 1} className="ml-2 p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full disabled:text-gray-400 dark:disabled:text-gray-500 disabled:bg-transparent disabled:cursor-not-allowed">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                                    <div className="flex items-end justify-center sm:justify-start gap-4">
                                        <div className="flex flex-col items-center gap-1">
                                            <label htmlFor={`permissive-${index}`} className="text-xs dark:text-gray-300">비보호</label>
                                            <input
                                                type="checkbox"
                                                id={`permissive-${index}`}
                                                checked={phase.isPermissive || false}
                                                onChange={() => handleTogglePermissive(index)}
                                                disabled={isRecordModeActive}
                                                className="w-4 h-4 accent-blue-600"
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
                                                    className="w-24 text-center font-mono text-2xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none"
                                                    autoFocus
                                                />
                                            ) : (
                                                <>
                                                    <span className="font-mono text-2xl font-bold" onClick={() => handleEditTimeClick(index, latestTime)}>
                                                        {isCurrentlyTiming ? timer.elapsed.toFixed(1) : latestTime.toFixed(1)}
                                                    </span>
                                                    <button 
                                                        onClick={() => handleEditTimeClick(index, latestTime)} 
                                                        disabled={isRecordModeActive || timer.active}
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
                                            className={`w-28 p-2 rounded-md text-white font-semibold flex items-center justify-center gap-2 transition-colors ${isRecordModeActive || (timer.active && !isCurrentlyTiming) ? 'bg-gray-400 cursor-not-allowed' : (isCurrentlyTiming ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600')}`}
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
                    <div className="mt-6">
                        <button onClick={handleAddPhase} disabled={isRecordModeActive} className="w-full flex items-center justify-center gap-2 p-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-400 transition-colors disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:cursor-not-allowed">
                            <Plus size={18} />
                            현시 추가
                        </button>
                    </div>
                    <div className="mt-8 border-t dark:border-gray-700 pt-6">
                         <h3 className="text-lg font-semibold text-center mb-3 dark:text-white">연속 시간 기록 모드</h3>
                         <button 
                            onClick={isRecordModeActive ? handleRecordAndNext : handleToggleRecordMode}
                            disabled={timer.active && !isRecordModeActive}
                            className={`w-full p-4 rounded-lg text-white font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 shadow-lg ${isRecordModeActive ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} disabled:bg-gray-400 disabled:cursor-not-allowed`}
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
                 <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                    <textarea 
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                        placeholder="현장 특이사항, 주변 여건 등 자유롭게 메모하세요..."
                        className="w-full h-40 p-3 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-gray-700 dark:text-white"
                    ></textarea>
               </div>
            </section>
            
            <div className="mt-8">
                <button onClick={handleSaveAll} disabled={isSaving} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-4 px-4 rounded-lg shadow-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400">
                    <Save size={20} />
                    {isSaving ? '저장 중...' : '저장'}
                </button>
            </div>
        </div>
    );
};

const IntersectionList = ({ intersections, onSelect, onAdd, onDelete, onEdit, onBack }) => {
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
        setSwipedId(id);
        touchStartX.current = e.targetTouches[0].clientX;
    }

    const handleTouchMove = (id, e) => {
        touchEndX.current = e.targetTouches[0].clientX;
        const diff = touchEndX.current - touchStartX.current;
        const target = itemRefs.current[id];
        if (!target) return;
        
        // Swipe left to reveal options
        if (diff < 0) {
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
                        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
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
            <div className="mb-4">
                <button onClick={onAdd} className="flex items-center justify-center gap-2 w-full sm:w-auto bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors">
                    <Plus size={20} /> 교차로 추가
                </button>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {intersections.length === 0 ? (
                        <li className="p-6 text-center text-gray-500 dark:text-gray-400">'교차로 추가' 버튼을 눌러 첫 교차로를 등록하세요.</li>
                    ) : (
                        intersections.map(intersection => (
                            <li key={intersection.id} className="relative overflow-hidden">
                                <div className="absolute top-0 right-0 h-full flex items-center">
                                    <button onClick={() => startEditing(intersection)} className="h-full w-16 flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500"><Edit size={20} /></button>
                                    <button onClick={() => onDelete(intersection.id)} className="h-full w-16 flex items-center justify-center bg-red-500 text-white hover:bg-red-600"><Trash2 size={20} /></button>
                                </div>
                                <div 
                                    ref={el => itemRefs.current[intersection.id] = el}
                                    className="relative bg-white dark:bg-gray-800 transition-transform duration-300"
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
                                                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold rounded-lg flex items-center justify-center text-lg">{intersection.number}</div>
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
    }

    const handleTouchMove = (id, e) => {
        touchEndX.current = e.targetTouches[0].clientX;
        const diff = touchEndX.current - touchStartX.current;
        const target = itemRefs.current[id];
        if (!target) return;

        if (diff < 0) {
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
        } else {
            target.style.transform = '';
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
                <button onClick={onAdd} className="flex items-center justify-center gap-2 w-full sm:w-auto bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors">
                    <Plus size={20} /> 새 프로젝트 추가
                </button>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {projects.length === 0 ? (
                        <li className="p-6 text-center text-gray-500 dark:text-gray-400">'새 프로젝트 추가' 버튼을 눌러 시작하세요.</li>
                    ) : (
                        projects.map((project, index) => (
                            <li key={project.id} className="relative overflow-hidden">
                                <div className="absolute top-0 right-0 h-full flex items-center">
                                    <button onClick={() => startEditing(project)} className="h-full w-16 flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500"><Edit size={20} /></button>
                                    <button onClick={() => onDelete(project.id)} className="h-full w-16 flex items-center justify-center bg-red-500 text-white hover:bg-red-600"><Trash2 size={20} /></button>
                                </div>
                                <div 
                                    ref={el => itemRefs.current[project.id] = el}
                                    className="relative bg-white dark:bg-gray-800 transition-transform duration-300"
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
            setLogLevel('debug');
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
            phases: Array(4).fill({ direction: null, type: null, times: [], isPermissive: false }),
            location: null,
            mapIcons: {},
            memo: '',
            representativePhoto: null
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

    const selectIntersection = (intersection) => {
        setSelectedIntersection(intersection);
        setView('detail');
    }

    const backToIntersections = useCallback(() => {
        setSelectedIntersection(null);
        setView('intersections');
    }, []);

    // --- Render Logic ---
    if (loading) return <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900 dark:text-gray-300">Loading...</div>;
    if (error) return <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900 text-red-500">{error}</div>;
    
    return (
        <div className="bg-gray-50 dark:bg-gray-900 min-h-screen font-sans text-gray-800 dark:text-gray-200">
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
                <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-full bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm hover:bg-gray-200 dark:hover:bg-gray-700">
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
            
            <footer className="fixed bottom-0 left-0 right-0 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-center p-2 text-sm text-gray-500 dark:text-gray-400 z-30">
                <p>Created by NYH | v1.3.8</p>
                {userId && <p className="text-xs text-gray-400 mt-1">사용자 ID: {userId}</p>}
            </footer>
        </div>
    );
}
