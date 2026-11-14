export function applyAppUpdate(registration, serviceWorker, reload) {
    const waiting = registration?.waiting;
    if (!waiting) {
        reload();
        return () => {};
    }

    let finished = false;
    let timeout;
    const cleanup = () => {
        finished = true;
        clearTimeout(timeout);
        serviceWorker.removeEventListener('controllerchange', finish);
    };
    function finish() {
        if (finished) return;
        cleanup();
        reload();
    }

    serviceWorker.addEventListener('controllerchange', finish);
    timeout = setTimeout(finish, 2500);
    try {
        waiting.postMessage('SKIP_WAITING');
    } catch {
        finish();
    }
    return cleanup;
}
