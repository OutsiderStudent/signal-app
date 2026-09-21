import { fireEvent, render, screen } from '@testing-library/react';
import {
  MOVEMENT_DIRECTIONS,
  MOVEMENT_TYPES,
  DirectionSettingsModal,
  IntersectionList,
  MovementArrowIcon,
  OverflowingName,
  PhaseMovementSummary,
  PhaseSelectionModal,
  ProjectList,
  ProjectIntersectionMap,
  SettingsModal,
  buildExportCsv,
  buildWorkbookData,
  areCoordinatesEqual,
  areMapIconsEqual,
  formatPhaseMovements,
  formatSavedAt,
  getIntersectionStatus,
  isEdgeBackSwipe,
  normalizePhaseMovements,
  normalizeDirections,
  reattachMapMarker,
  getApproachMarkerPosition,
  showToast,
} from './App';
import { REGION_POINTS, REGION_PROVINCES, getRegionDistricts, getRegionPoint } from './regions';

test('positions new approach markers on the arrival side of the intersection', () => {
  const center = { lat: 37.5665, lng: 126.978 };
  expect(getApproachMarkerPosition(center, 'SB').lat).toBeGreaterThan(center.lat);
  expect(getApproachMarkerPosition(center, 'NB').lat).toBeLessThan(center.lat);
  expect(getApproachMarkerPosition(center, 'EB').lng).toBeLessThan(center.lng);
  expect(getApproachMarkerPosition(center, 'WB').lng).toBeGreaterThan(center.lng);
  expect(getApproachMarkerPosition(center, 'SWB')).toEqual(expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }));
  expect(getApproachMarkerPosition(center, 'SWB').lat).toBeGreaterThan(center.lat);
  expect(getApproachMarkerPosition(center, 'SWB').lng).toBeGreaterThan(center.lng);
});

test('offers offline region navigation for all provinces and current municipalities', () => {
  expect(REGION_PROVINCES).toHaveLength(17);
  expect(REGION_POINTS.length).toBeGreaterThan(220);
  expect(getRegionDistricts('인천광역시')).toContain('검단구');
  expect(getRegionDistricts('인천광역시')).not.toContain('남구');
  expect(getRegionDistricts('대구광역시')).toContain('군위군');
  expect(REGION_POINTS.every(([, , lat, lng]) => lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132)).toBe(true);
  expect(new Set(REGION_POINTS.map(([province, district]) => `${province}/${district}`)).size).toBe(REGION_POINTS.length);
  expect(getRegionPoint('서울특별시', '강남구')).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
  expect(getRegionPoint('서울특별시', '없는 지역')).toBeNull();
});

test('puts save feedback below the iPhone safe area', () => {
  showToast('저장되었습니다.');
  const toast = screen.getByRole('status');
  expect(toast).toHaveClass('app-toast');
  toast.remove();
});

test('keeps names in a two-line overflow container with the full title available', () => {
  const name = '아주 긴 프로젝트 및 교차로 이름 전체 내용';
  const { container } = render(<OverflowingName>{name}</OverflowingName>);
  expect(container.querySelector('.overflowing-name')).toHaveAttribute('title', name);
  expect(screen.getByText(name)).toHaveClass('overflowing-name__clamp');
});

test('recognizes only a deliberate right swipe from the left screen edge as back navigation', () => {
  expect(isEdgeBackSwipe({ x: 12, y: 200 }, { x: 110, y: 215 })).toBe(true);
  expect(isEdgeBackSwipe({ x: 80, y: 200 }, { x: 190, y: 205 })).toBe(false);
  expect(isEdgeBackSwipe({ x: 12, y: 200 }, { x: 60, y: 205 })).toBe(false);
  expect(isEdgeBackSwipe({ x: 12, y: 200 }, { x: 120, y: 290 })).toBe(false);
});

test('keeps the project creation date on one line', () => {
  render(
    <ProjectList
      projects={[{ id: 'p1', name: '긴 프로젝트 이름', createdAt: { toDate: () => new Date('2026-09-20T00:00:00') } }]}
      onSelect={() => {}}
      onAdd={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
      onMove={() => {}}
    />,
  );
  expect(screen.getByText(/생성일:/)).toHaveClass('whitespace-nowrap');
});

test('places list navigation above the centered title and keeps controls equally tall', () => {
  const { unmount } = render(
    <ProjectList
      projects={[]}
      onSelect={() => {}}
      onAdd={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
      onMove={() => {}}
    />,
  );
  expect(screen.getByRole('heading', { name: '프로젝트' }).parentElement).toHaveClass('grid-cols-[3rem_minmax(0,1fr)_3rem]');
  unmount();

  render(
    <IntersectionList
      intersections={[]}
      onSelect={() => {}}
      onAdd={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
      onBack={() => {}}
    />,
  );
  const backButton = screen.getByRole('button', { name: '프로젝트' });
  expect(backButton).toHaveClass('h-12', 'whitespace-nowrap');
  expect(backButton.querySelector('span')).not.toHaveClass('truncate');
  expect(screen.getByRole('heading', { name: '교차로 목록' })).toHaveClass('text-center', 'mt-2');
  expect(backButton.parentElement).toHaveClass('justify-between', 'h-12');
});

test('toggles project actions with the more button', () => {
  render(
    <ProjectList
      projects={[{ id: 'p1', name: '현장조사', createdAt: { toDate: () => new Date('2026-09-20T00:00:00') } }]}
      onSelect={() => {}}
      onAdd={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
      onMove={() => {}}
    />,
  );
  const menuButton = screen.getByRole('button', { name: '현장조사 작업 메뉴' });
  fireEvent.click(menuButton);
  expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(menuButton);
  expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: '현장조사 편집', hidden: true })).toHaveAttribute('tabindex', '-1');
});

test('closes project swipe actions before showing the edit form', () => {
  const { container } = render(
    <ProjectList
      projects={[{ id: 'p1', name: '현장조사', createdAt: { toDate: () => new Date('2026-09-20T00:00:00') } }]}
      onSelect={() => {}}
      onAdd={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
      onMove={() => {}}
    />,
  );
  const menuButton = screen.getByRole('button', { name: '현장조사 작업 메뉴' });
  fireEvent.click(menuButton);
  const editButton = screen.getByRole('button', { name: '현장조사 편집' });
  const foreground = editButton.closest('li').querySelector('.z-10');
  expect(foreground).toHaveStyle({ transform: 'translateX(-128px)' });

  fireEvent.click(editButton);

  expect(foreground.style.transform).toBe('');
  expect(editButton.parentElement).toHaveClass('opacity-0', 'pointer-events-none');
  expect(screen.getByRole('textbox', { name: '프로젝트명 편집' })).toBeInTheDocument();
});

const settingsProps = {
  isOpen: true,
  onClose: () => {},
  isDarkMode: false,
  onToggleDarkMode: () => {},
  vibrationEnabled: true,
  soundEnabled: true,
  onToggleVibration: () => {},
  onToggleSound: () => {},
  onInstall: () => {},
  onBackup: () => {},
  onReset: () => {},
};

test('always shows iPhone PWA installation guidance when a native prompt is unavailable', () => {
  render(<SettingsModal {...settingsProps} canInstall={false} isInstalled={false} isIos />);
  expect(screen.getByRole('region', { name: '홈 화면 앱 설치 안내' })).toBeInTheDocument();
  expect(screen.getByText(/Safari의/)).toBeInTheDocument();
  expect(screen.getByText('홈 화면에 추가')).toBeInTheDocument();
});

test('offers a direct PWA install action when the browser supports it', () => {
  const onInstall = jest.fn();
  render(<SettingsModal {...settingsProps} canInstall isInstalled={false} isIos={false} onInstall={onInstall} />);
  fireEvent.click(screen.getByRole('button', { name: '지금 설치하기' }));
  expect(onInstall).toHaveBeenCalledTimes(1);
});

test.each(MOVEMENT_DIRECTIONS.flatMap(direction => MOVEMENT_TYPES.map(type => [direction, type])))('renders %s %s movement without shared arrow markers', (direction, type) => {
  const { container } = render(<MovementArrowIcon direction={direction} type={type} />);
  expect(screen.getByRole('img', { name: `${direction} ${type}` })).toBeInTheDocument();
  expect(container.querySelector('marker')).not.toBeInTheDocument();
});

test('combines multiple directional movements into one phase', () => {
  const onSave = jest.fn();
  render(<PhaseSelectionModal onSave={onSave} onClose={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'SB 직진 선택' }));
  fireEvent.click(screen.getByRole('button', { name: 'SB 좌회전 선택' }));
  fireEvent.click(screen.getByRole('button', { name: '현시 적용' }));

  expect(onSave).toHaveBeenCalledWith([
    { direction: 'SB', type: '직진' },
    { direction: 'SB', type: '좌회전' },
  ]);
});

test('migrates legacy combined phases to movement combinations', () => {
  expect(normalizePhaseMovements({ direction: 'SB', type: '양방직진' })).toEqual([
    { direction: 'SB', type: '직진' },
    { direction: 'NB', type: '직진' },
  ]);
  expect(formatPhaseMovements(normalizePhaseMovements({ direction: 'SB', type: '직좌동시' }))).toBe('SB 직진·좌회전');
});

test('removes U-turn from the selectable movement set', () => {
  expect(MOVEMENT_TYPES).toEqual(['직진', '좌회전', '우회전']);
  render(<PhaseSelectionModal onSave={() => {}} onClose={() => {}} />);
  expect(screen.queryByText('유턴')).not.toBeInTheDocument();
  expect(screen.getByRole('grid', { name: '4방향 3이동류 선택표' })).toBeInTheDocument();
});

test('renders permissive left turns in amber and protected movements in green', () => {
  const { rerender } = render(<PhaseMovementSummary movements={[{ direction: 'SB', type: '좌회전' }]} />);
  expect(screen.getByText('SB 좌회전')).toHaveClass('text-emerald-700');
  rerender(<PhaseMovementSummary movements={[{ direction: 'SB', type: '좌회전' }]} isPermissive />);
  expect(screen.getByText('SB 좌회전')).toHaveClass('text-amber-700');
});

test('toggles cardinal and diagonal approaches on a compass and reports the exact leg count', () => {
  const onSave = jest.fn();
  render(<DirectionSettingsModal directions={['SB', 'NB', 'EB', 'WB']} onSave={onSave} onClose={() => {}} />);
  expect(screen.getByRole('group', { name: '나침반형 교차로 방향 선택' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'SWB 방향 켜기' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'SWB 방향 켜기' }));
  fireEvent.click(screen.getByRole('button', { name: 'SEB 방향 켜기' }));
  fireEvent.click(screen.getByRole('button', { name: 'WB 방향 끄기' }));
  fireEvent.click(screen.getByRole('button', { name: '방향 적용' }));
  expect(onSave).toHaveBeenCalledWith(['SB', 'SWB', 'NB', 'EB', 'SEB']);
});

test('allows a four-leg intersection to become three-leg but prevents fewer than three directions', () => {
  const onSave = jest.fn();
  render(<DirectionSettingsModal directions={['SB', 'NB', 'EB', 'WB']} onSave={onSave} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'WB 방향 끄기' }));
  expect(screen.getByRole('button', { name: 'EB 방향 끄기' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '방향 적용' }));
  expect(onSave).toHaveBeenCalledWith(['SB', 'NB', 'EB']);
});

test('preserves a saved three-leg configuration instead of restoring all four defaults', () => {
  expect(normalizeDirections(['SB', 'NB', 'EB'])).toEqual(['SB', 'NB', 'EB']);
  expect(normalizeDirections(undefined)).toEqual(['SB', 'WB', 'NB', 'EB']);
});

test('preserves valid duplicate movements used by special intersections', () => {
  expect(normalizePhaseMovements({ movements: [
    { direction: 'SB', type: '직진' },
    { direction: 'SB', type: '직진' },
  ] })).toEqual([
    { direction: 'SB', type: '직진' },
    { direction: 'SB', type: '직진' },
  ]);
});

test('marks an intersection complete only when identity, location and every phase time are present', () => {
  const base = { number: 1, name: '시청', location: { lat: 37.5, lng: 127 } };
  expect(getIntersectionStatus({ ...base, phases: [{ movements: [], times: [3] }] })).toBe('조사완료');
  expect(getIntersectionStatus({ ...base, phases: [{ movements: [], times: [] }] })).toBe('조사필요');
  expect(getIntersectionStatus({ ...base, location: null, phases: [{ movements: [], times: [3] }] })).toBe('조사필요');
});

test('formats last saved time down to seconds', () => {
  expect(formatSavedAt(new Date('2026-09-19T03:04:05Z'))).toMatch(/05/);
  expect(formatSavedAt(null)).toBe('아직 저장되지 않음');
});

test('supports diagonal movements in phase data and selection grids', () => {
  expect(normalizePhaseMovements({ movements: [{ direction: 'SWB', type: '직진' }] })).toEqual([{ direction: 'SWB', type: '직진' }]);
  render(<PhaseSelectionModal directions={['SB', 'SWB', 'NB', 'NEB', 'EB']} onSave={() => {}} onClose={() => {}} />);
  expect(screen.getByRole('grid', { name: '5방향 3이동류 선택표' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'SWB 직진 선택' })).toBeInTheDocument();
});

test('exports complete Korean CSV data with safe quotes and field details', () => {
  const csv = buildExportCsv(
    [{ id: 'p1', name: '프로젝트, "A"' }],
    { p1: [{
      number: 1,
      name: '시청 교차로',
      location: { lat: 37.5, lng: 127 },
      directions: ['SB', 'NB', 'EB', 'WB'],
      memo: '쉼표, 따옴표 "확인"',
      phases: [{ movements: [{ direction: 'SB', type: '직진' }], times: [12.3, 12.8], isPermissive: false }],
    }] },
    { p1: true },
  );

  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('"프로젝트, ""A"""');
  expect(csv).toContain('"37.5","127"');
  expect(csv).toContain('"SB 직진"');
  expect(csv).toContain('"12.3 · 12.8"');
  expect(csv).toContain('"쉼표, 따옴표 ""확인"""');
});

test('normalizes XLSX export into separate phase, observation and movement rows', () => {
  const tables = buildWorkbookData(
    [{ id: 'p1', name: '현장조사' }],
    { p1: [{ id: 'i1', number: 1, name: '시청', location: { lat: 37.5, lng: 127 }, phases: [{ movements: [{ direction: 'SB', type: '직진' }], times: [10, 11] }] }] },
    { p1: true },
  );
  expect(tables.교차로).toHaveLength(1);
  expect(tables.현시).toHaveLength(1);
  expect(tables.시간관측).toHaveLength(2);
  expect(tables.이동류).toEqual([expect.objectContaining({ 방향: 'SB', 이동류: '직진' })]);
});

test('keeps intersection edit actions hidden until a real left swipe', () => {
  const intersection = { id: 'i1', number: 1, name: '시청 교차로', location: null };
  const { container } = render(
    <IntersectionList
      intersections={[intersection]}
      onSelect={() => {}}
      onAdd={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
      onBack={() => {}}
    />,
  );

  const editButton = container.querySelector('[aria-label="시청 교차로 편집"]');
  const foreground = screen.getByText('시청 교차로').closest('li').querySelector('.z-10');
  expect(editButton).toHaveAttribute('tabindex', '-1');
  expect(editButton.parentElement).toHaveClass('opacity-0', 'pointer-events-none');

  fireEvent.touchStart(foreground, { targetTouches: [{ clientX: 220 }] });
  fireEvent.touchMove(foreground, { targetTouches: [{ clientX: 120 }] });
  fireEvent.touchEnd(foreground);

  expect(editButton).toHaveAttribute('tabindex', '0');
  expect(editButton.parentElement).toHaveClass('opacity-100');
  expect(foreground).toHaveStyle({ transform: 'translateX(-128px)' });

  fireEvent.touchStart(foreground, { targetTouches: [{ clientX: 120 }] });
  fireEvent.touchMove(foreground, { targetTouches: [{ clientX: 220 }] });
  fireEvent.touchEnd(foreground);

  expect(editButton).toHaveAttribute('tabindex', '-1');
  expect(editButton.parentElement).toHaveClass('opacity-0', 'pointer-events-none');
  expect(foreground.style.transform).toBe('');
});

test('toggles intersection actions closed when the more button is pressed again', () => {
  const intersection = { id: 'i1', number: 1, name: '시청 교차로', location: null };
  const { container } = render(
    <IntersectionList
      intersections={[intersection]}
      onSelect={() => {}}
      onAdd={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
      onBack={() => {}}
    />,
  );
  const menuButton = screen.getByRole('button', { name: '시청 교차로 작업 메뉴' });
  const foreground = screen.getByText('시청 교차로').closest('li').querySelector('.z-10');

  fireEvent.click(menuButton);
  expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  expect(foreground).toHaveStyle({ transform: 'translateX(-128px)' });

  fireEvent.click(menuButton);
  expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  expect(foreground.style.transform).toBe('');
  expect(container.querySelector('[aria-label="시청 교차로 편집"]').parentElement).toHaveClass('opacity-0', 'pointer-events-none');
});

test('closes intersection swipe actions before showing the responsive edit form', () => {
  const intersection = { id: 'i1', number: 1, name: '시청 교차로', location: null };
  render(
    <IntersectionList
      intersections={[intersection]}
      onSelect={() => {}}
      onAdd={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
      onBack={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '시청 교차로 작업 메뉴' }));
  const editButton = screen.getByRole('button', { name: '시청 교차로 편집' });
  const foreground = editButton.closest('li').querySelector('.z-10');

  fireEvent.click(editButton);

  expect(foreground.style.transform).toBe('');
  expect(editButton.parentElement).toHaveClass('opacity-0', 'pointer-events-none');
  expect(screen.getByRole('spinbutton', { name: '교차로 번호 편집' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '교차로명 편집' })).toHaveClass('min-w-0', 'w-full');
});

test('summarizes located intersections and explains missing locations on the project map', () => {
  const { rerender } = render(<ProjectIntersectionMap intersections={[]} onSelect={() => {}} />);
  expect(screen.getByText('위치 0/0')).toBeInTheDocument();
  expect(screen.getByText('저장된 교차로 위치가 없습니다.')).toBeInTheDocument();

  rerender(
    <ProjectIntersectionMap
      intersections={[
        { id: 'i1', number: 1, name: '시청', location: { lat: 37.5, lng: 127 } },
        { id: 'i2', number: 2, name: '역앞', location: null },
      ]}
      onSelect={() => {}}
    />,
  );
  expect(screen.getByText('위치 1/2')).toBeInTheDocument();
  expect(screen.getByLabelText('등록된 교차로 지도')).toBeInTheDocument();
});

test('reattaches direction markers when the map instance is refreshed after saving', () => {
  const marker = { setPosition: jest.fn(), setMap: jest.fn() };
  const map = { id: 'refreshed-map' };
  const position = { lat: 37.5, lng: 127 };

  reattachMapMarker(marker, map, position);

  expect(marker.setPosition).toHaveBeenCalledWith(position);
  expect(marker.setMap).toHaveBeenCalledWith(map);
});

test('treats Firestore coordinate echoes as unchanged to prevent save loops', () => {
  expect(areCoordinatesEqual(
    { lat: 37.56650000001, lng: 126.97800000001 },
    { lat: 37.5665, lng: 126.978 },
  )).toBe(true);
  expect(areCoordinatesEqual({ lat: 37.5665, lng: 126.978 }, { lat: 37.567, lng: 126.978 })).toBe(false);
});

test('compares direction marker positions independent of object key order', () => {
  expect(areMapIconsEqual(
    { SB: { lat: 37.5, lng: 127 }, NB: { lat: 37.51, lng: 127.01 } },
    { NB: { lat: 37.51, lng: 127.01 }, SB: { lat: 37.5, lng: 127 } },
  )).toBe(true);
});
