import { applyAppUpdate } from './appUpdate';

test('reloads when the waiting worker has already activated', () => {
    const reload = jest.fn();
    applyAppUpdate({ waiting: null }, new EventTarget(), reload);
    expect(reload).toHaveBeenCalledTimes(1);
});

test('reloads once when the new worker takes control', () => {
    jest.useFakeTimers();
    try {
        const serviceWorker = new EventTarget();
        const waiting = { postMessage: jest.fn() };
        const reload = jest.fn();
        applyAppUpdate({ waiting }, serviceWorker, reload);
        expect(waiting.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
        expect(reload).not.toHaveBeenCalled();
        serviceWorker.dispatchEvent(new Event('controllerchange'));
        jest.runAllTimers();
        expect(reload).toHaveBeenCalledTimes(1);
    } finally {
        jest.useRealTimers();
    }
});

test('reloads if the browser never reports a controller change', () => {
    jest.useFakeTimers();
    try {
        const serviceWorker = new EventTarget();
        const reload = jest.fn();
        applyAppUpdate({ waiting: { postMessage: jest.fn() } }, serviceWorker, reload);
        jest.advanceTimersByTime(2500);
        serviceWorker.dispatchEvent(new Event('controllerchange'));
        expect(reload).toHaveBeenCalledTimes(1);
    } finally {
        jest.useRealTimers();
    }
});
