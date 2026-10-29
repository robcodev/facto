// Keeps late responses from replacing the preview after an edit or navigation.
export class PreviewTask {
    private active: AbortController | null = null;
    begin() {
        if (this.active) return null;
        this.active = new AbortController();
        return this.active;
    }
    isCurrent(task: AbortController) { return this.active === task && !task.signal.aborted; }
    finish(task: AbortController) {
        if (!this.isCurrent(task)) return false;
        this.active = null;
        return true;
    }
    cancel() {
        this.active?.abort();
        this.active = null;
    }
}

// Both the load event and its fallback may fire; only one may open the dialog.
export function printOnce(target: { closed: boolean; print(): void }) {
    let requested = false;
    return () => {
        if (requested || target.closed) return;
        requested = true;
        target.print();
    };
}
