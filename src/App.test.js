import { fireEvent, render, screen } from '@testing-library/react';
import {
  MOVEMENT_DIRECTIONS,
  MOVEMENT_TYPES,
  DirectionSettingsModal,
  MovementArrowIcon,
  PhaseMovementSummary,
  PhaseSelectionModal,
  buildExportCsv,
  formatPhaseMovements,
  normalizePhaseMovements,
} from './App';

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

test('adds diagonal approaches for five-leg and larger intersections', () => {
  const onSave = jest.fn();
  render(<DirectionSettingsModal directions={['SB', 'NB', 'EB', 'WB']} onSave={onSave} onClose={() => {}} />);
  expect(screen.queryByRole('button', { name: 'SWB 방향 추가' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /5지 이상 교차로/ }));
  fireEvent.click(screen.getByRole('button', { name: 'SWB 방향 추가' }));
  fireEvent.click(screen.getByRole('button', { name: 'SEB 방향 추가' }));
  fireEvent.click(screen.getByRole('button', { name: '방향 적용' }));
  expect(onSave).toHaveBeenCalledWith(['SB', 'SWB', 'WB', 'NB', 'EB', 'SEB']);
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
