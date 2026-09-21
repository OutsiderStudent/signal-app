import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { IntersectionDetail } from './App';

jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'),
  doc: jest.fn(),
  onSnapshot: jest.fn(),
  updateDoc: jest.fn(),
}));

test('browsing the map never saves a location until it is explicitly confirmed', async () => {
  const originalGoogle = window.google;
  let mapInstance;
  const originalLocation = { lat: 37.5665, lng: 126.978 };
  const nextLocation = { lat: 35.8714, lng: 128.6014 };
  class FakeMap {
    constructor(element, options) {
      this.center = options.center;
      this.listeners = {};
      mapInstance = this;
    }
    getCenter() { return { toJSON: () => this.center }; }
    panTo(position) { this.center = position; }
    setZoom() {}
    setMapTypeId() {}
    addListener(event, handler) { this.listeners[event] = handler; }
  }
  class FakeMarker {
    constructor(options) { this.position = options.position; }
    setPosition(position) { this.position = position; }
    setMap() {}
    addListener() {}
  }
  window.google = { maps: { Map: FakeMap, Marker: FakeMarker, SymbolPath: { CIRCLE: 'circle' } } };
  doc.mockReturnValue({ path: 'test-intersection' });
  onSnapshot.mockImplementation((reference, callback) => {
    callback({ exists: () => true, data: () => ({ location: originalLocation, mapIcons: {}, phases: [{ movements: [], times: [] }], directions: ['SB', 'NB', 'EB', 'WB'] }) });
    return () => {};
  });
  updateDoc.mockResolvedValue(undefined);

  const { unmount } = render(<IntersectionDetail intersection={{ id: 'test-intersection', name: '시험 교차로', number: 1 }} db={{}} userId="test-user" appId="test-app" projectId="test-project" onBack={() => {}} vibrationEnabled={false} soundEnabled={false} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '위치 변경' })).toBeEnabled());

  act(() => { mapInstance.panTo(nextLocation); mapInstance.listeners.idle?.(); });
  expect(mapInstance.listeners.idle).toBeUndefined();
  expect(updateDoc).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: '위치 변경' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(updateDoc).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: '위치 변경' }));
  fireEvent.click(screen.getByRole('button', { name: '이 위치로 확정' }));
  await waitFor(() => expect(updateDoc).toHaveBeenCalledWith({ path: 'test-intersection' }, expect.objectContaining({ location: nextLocation })));
  unmount();
  window.google = originalGoogle;
});
