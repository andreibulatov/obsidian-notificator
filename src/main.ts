import { App, Modal, Plugin, PluginSettingTab, Setting, TFile, MarkdownPostProcessorContext, Editor, MarkdownView, Notice, TAbstractFile, ItemView, WorkspaceLeaf } from 'obsidian';

const VIEW_TYPE_CALENDAR = "notificator-calendar-view";

interface ProjectedOccurrence {
    date: DateTime;
    comment: string;
    filePath: string;
    type: 'past' | 'future';
}

class CalendarView extends ItemView {
    plugin: NotificatorPlugin;
    currentDate: DateTime;
    projectedOccurrences: ProjectedOccurrence[] = [];
    showProjected: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: NotificatorPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentDate = DateTime.now();
    }

    getViewType() {
        return VIEW_TYPE_CALENDAR;
    }

    getDisplayText() {
        return "Notificator Calendar";
    }

    async onOpen() {
        this.render();
    }

    render() {
        const container = this.containerEl.children[1];
        container.empty();
        container.classList.add('notificator-calendar-container');

        const header = container.createDiv({ cls: 'notificator-calendar-header' });
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.style.marginBottom = "10px";

        const prevBtn = header.createEl("button", { text: "<" });
        prevBtn.onclick = () => {
            this.currentDate = this.currentDate.minus({ months: 1 });
            this.render();
        };

        header.createEl("h4", { text: this.currentDate.toFormat('LLLL yyyy') });

        const nextBtn = header.createEl("button", { text: ">" });
        nextBtn.onclick = () => {
            this.currentDate = this.currentDate.plus({ months: 1 });
            this.render();
        };

        const forecastBtn = header.createEl("button", { text: "Forecast 3m" });
        forecastBtn.onclick = () => {
            this.calculateProjected();
            this.showProjected = !this.showProjected;
            this.render();
        };

        const grid = container.createDiv({ cls: 'notificator-calendar-grid' });
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "repeat(7, 1fr)";
        grid.style.gap = "2px";
        grid.style.border = "1px solid var(--background-modifier-border)";

        const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        daysOfWeek.forEach(day => {
            grid.createDiv({ text: day, cls: 'calendar-weekday' }).style.fontWeight = "bold";
        });

        const startOfMonth = this.currentDate.startOf('month');
        const endOfMonth = this.currentDate.endOf('month');
        
        // Luxon uses 1 for Monday, 7 for Sunday
        let startDay = startOfMonth.weekday; // 1-7
        
        // Padding for the first week
        for (let i = 1; i < startDay; i++) {
            grid.createDiv({ cls: 'calendar-day empty' });
        }

        for (let day = 1; day <= endOfMonth.day; day++) {
            const date = startOfMonth.set({ day });
            const dayEl = grid.createDiv({ cls: 'calendar-day' });
            dayEl.style.minHeight = "40px";
            dayEl.style.border = "1px solid var(--background-modifier-border-focus)";
            dayEl.style.padding = "2px";
            dayEl.style.position = "relative";
            
            dayEl.createDiv({ text: day.toString(), cls: 'day-number' });

            const dayNotifications = this.plugin.notifications.filter(n => 
                n.targetDateTime.hasSame(date, 'day')
            );

            dayNotifications.forEach(n => {
                this.renderNotificationDot(dayEl, n.targetDateTime, n.comment, n.filePath, false);
            });

            if (this.showProjected) {
                const projected = this.projectedOccurrences.filter(p => p.date.hasSame(date, 'day'));
                projected.forEach(p => {
                    this.renderNotificationDot(dayEl, p.date, p.comment, p.filePath, true, p.type);
                });
            }
        }

        container.createEl("hr");
        container.createEl("h4", { text: "List View" });

        const list = container.createDiv({ cls: 'notificator-calendar-list' });
        
        // Sort by date
        let allItems: { date: DateTime, comment: string, filePath: string, status?: string, type?: string }[] = this.plugin.notifications.map(n => ({
            date: n.targetDateTime,
            comment: n.comment,
            filePath: n.filePath,
            status: n.status
        }));

        if (this.showProjected) {
            allItems = allItems.concat(this.projectedOccurrences.map(p => ({
                date: p.date,
                comment: p.comment,
                filePath: p.filePath,
                type: p.type
            })));
        }

        const sorted = allItems.sort((a, b) => a.date.toMillis() - b.date.toMillis());

        if (sorted.length === 0) {
            list.createEl("p", { text: "No notifications found." });
            return;
        }

        sorted.forEach(n => {
            const item = list.createDiv({ cls: 'notificator-calendar-item' });
            item.style.borderBottom = "1px solid var(--background-modifier-border)";
            item.style.padding = "5px 0";
            
            const link = item.createEl('a', { text: `${n.date.toFormat('dd.MM.yyyy HH:mm')} - ${n.comment}` });
            link.onclick = () => {
                this.app.workspace.openLinkText(n.filePath, n.filePath);
            };
            if (n.status) {
                item.createEl('span', { text: ` [${n.status}]`, cls: `status-${n.status}` });
            } else if (n.type) {
                const span = item.createEl('span', { text: ` [${n.type}]`, cls: `status-projected-${n.type}` });
                span.style.opacity = "0.6";
                span.style.fontStyle = "italic";
            }
        });
    }

    renderNotificationDot(parent: HTMLElement, date: DateTime, comment: string, filePath: string, isProjected: boolean, type?: 'past' | 'future') {
        const notifEl = parent.createDiv({ cls: 'calendar-notif-dot' });
        notifEl.style.fontSize = "10px";
        notifEl.style.cursor = "pointer";
        notifEl.style.backgroundColor = isProjected ? (type === 'past' ? "var(--text-muted)" : "var(--interactive-accent-hover)") : "var(--interactive-accent)";
        notifEl.style.color = "var(--text-on-accent)";
        notifEl.style.borderRadius = "2px";
        notifEl.style.marginBottom = "1px";
        notifEl.style.padding = "0 2px";
        notifEl.style.whiteSpace = "nowrap";
        notifEl.style.overflow = "hidden";
        notifEl.style.textOverflow = "ellipsis";
        if (isProjected) {
            notifEl.style.opacity = "0.7";
        }
        notifEl.title = `${date.toFormat('HH:mm')} ${comment}${isProjected ? ` (${type})` : ''}`;
        notifEl.setText(`${date.toFormat('HH:mm')}`);
        
        notifEl.onclick = (e) => {
            e.stopPropagation();
            this.app.workspace.openLinkText(filePath, filePath);
        };
    }

    calculateProjected() {
        this.projectedOccurrences = [];
        const now = DateTime.now();
        const threeMonthsLater = now.plus({ months: 3 });

        this.plugin.notifications.forEach(n => {
            // Past from history
            n.history.forEach(h => {
                // Try to find dates in history details
                // Format usually is "DD.MM.YYYY HH:mm status"
                const dateMatch = h.detail.match(/(\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2})/);
                if (dateMatch) {
                    const histDate = DateTime.fromFormat(dateMatch[1], 'dd.MM.yyyy HH:mm');
                    if (histDate.isValid && !histDate.hasSame(n.targetDateTime, 'minute')) {
                        // Check if we already added it (avoid duplicates)
                        if (!this.projectedOccurrences.some(p => p.date.hasSame(histDate, 'minute') && p.comment === n.comment)) {
                            this.projectedOccurrences.push({
                                date: histDate,
                                comment: n.comment,
                                filePath: n.filePath,
                                type: 'past'
                            });
                        }
                    }
                }
            });

            // Future for 3 months
            if (n.recurrence) {
                let next = this.plugin.calculateNextOccurrence(n.targetDateTime, n.recurrence);
                let count = 0;
                while (next && next <= threeMonthsLater && count < 100) { // Safety break at 100
                    this.projectedOccurrences.push({
                        date: next,
                        comment: n.comment,
                        filePath: n.filePath,
                        type: 'future'
                    });
                    next = this.plugin.calculateNextOccurrence(next, n.recurrence);
                    count++;
                }
            }
        });
    }

    async onClose() {
        // Nothing to clean up.
    }
}
import { DateTime } from 'luxon';

interface NotificationHistory {
    timestamp: string;
    action: string;
    detail: string;
}

interface NotificationData {
    id: string;
    targetDateTime: DateTime;
    comment: string;
    status: 'ok' | 'missed' | 'cancel' | 'postponed' | 'pending';
    history: NotificationHistory[];
    filePath: string;
    lineStart: number;
    lineEnd: number;
    lastMissedAlert?: DateTime;
    shown?: boolean;
    recurrence?: string;
}

interface NotificatorSettings {
    checkIntervalMinutes: number;
    missedReminderIntervalMinutes: number;
    emojis: string;
}

const DEFAULT_SETTINGS: NotificatorSettings = {
    checkIntervalMinutes: 1,
    missedReminderIntervalMinutes: 60,
    emojis: "☢️, 🟡, 🟢, 🟣, 🔥"
}

export default class NotificatorPlugin extends Plugin {
    settings: NotificatorSettings;
    notifications: NotificationData[] = [];

    async onload() {
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_CALENDAR,
            (leaf) => new CalendarView(leaf, this)
        );

        this.addCommand({
            id: "open-notificator-calendar",
            name: "Open Calendar",
            callback: () => {
                this.activateView();
            },
        });

        this.registerMarkdownCodeBlockProcessor("notifiactor", (source, el, ctx) => {
            this.processNotifiactorBlock(source, el, ctx);
        });

        this.addCommand({
            id: 'insert-notification',
            name: 'Insert Notification',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                new NotificationModal(this.app, this, (result) => {
                    const now = DateTime.now().toFormat('dd.MM.yyyy HH:mm');
                    const target = `${result.date} ${result.time}`;
                    const recurrence = result.recurrence ? ` 🔄 ${result.recurrence}` : "";
                    const commentWithEmoji = (result.emoji ? result.emoji + " " : "") + result.comment;
                    const block = `\`\`\`notifiactor\n${target} ${commentWithEmoji}${recurrence}\n-- history\n${now} created notification - ${target}\n\`\`\``;
                    editor.replaceSelection(block);
                }).open();
            }
        });

        this.addSettingTab(new NotificatorSettingTab(this.app, this));
        
        this.registerInterval(window.setInterval(() => this.checkNotifications(), this.settings.checkIntervalMinutes * 60 * 1000));
        
        // Initial scan
        this.app.workspace.onLayoutReady(() => {
            this.scanAllFiles();
        });

        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file instanceof TFile) this.scanFile(file);
        }));
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) await leaf.setViewState({ type: VIEW_TYPE_CALENDAR, active: true });
        }

        if (leaf) workspace.revealLeaf(leaf);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async scanAllFiles() {
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
            await this.scanFile(file);
        }
        this.updateCalendar();
    }

    updateCalendar() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);
        leaves.forEach(leaf => {
            if (leaf.view instanceof CalendarView) {
                leaf.view.render();
            }
        });
    }

    async scanFile(file: TFile) {
        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        const newNotifications: NotificationData[] = [];
        
        let inBlock = false;
        let startLine = -1;
        let blockSource = "";

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('```notifiactor')) {
                inBlock = true;
                startLine = i;
                blockSource = "";
                continue;
            }
            if (inBlock && lines[i].startsWith('```')) {
                inBlock = false;
                const data = this.parseBlock(blockSource, file.path, startLine, i);
                if (data) newNotifications.push(data);
                continue;
            }
            if (inBlock) {
                blockSource += lines[i] + "\n";
            }
        }

        // Update local cache for this file
        this.notifications = this.notifications.filter(n => n.filePath !== file.path).concat(newNotifications);
        this.updateCalendar();
    }

    parseBlock(source: string, filePath: string, lineStart: number, lineEnd: number): NotificationData | null {
        const lines = source.trim().split('\n');
        if (lines.length === 0) return null;
        
        const firstLine = lines[0];
        // Expected format: DD.MM.YYYY HH:mm Comment [🔄 Recurrence]
        const match = firstLine.match(/^(\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2})\s*(.*?)(?:\s*🔄\s*(.*))?$/);
        if (!match) return null;

        const targetStr = match[1];
        const comment = match[2].trim();
        const recurrence = match[3] ? match[3].trim() : undefined;
        const targetDateTime = DateTime.fromFormat(targetStr, 'dd.MM.yyyy HH:mm');

        const history: NotificationHistory[] = [];
        const historyIdx = lines.indexOf('-- history');
        if (historyIdx !== -1) {
            for (let i = historyIdx + 1; i < lines.length; i++) {
                history.push({ timestamp: '', action: '', detail: lines[i] });
            }
        }

        // Status is derived from history or default to pending
        let status: 'ok' | 'missed' | 'cancel' | 'postponed' | 'pending' = 'pending';
        
        // Find latest status in history
        const statusHistory = history.filter(h => h.detail.toLowerCase().includes('ok') || 
                                                 h.detail.toLowerCase().includes('cancel') || 
                                                 h.detail.toLowerCase().includes('postpone'));
        if (statusHistory.length > 0) {
            const lastStatusStr = statusHistory[statusHistory.length - 1].detail.toLowerCase();
            if (lastStatusStr.includes('ok')) status = 'ok';
            else if (lastStatusStr.includes('cancel')) status = 'cancel';
            else if (lastStatusStr.includes('postpone')) status = 'postponed';
        }

        // If no definitive status from history, check if it's missed
        if (status === 'pending') {
            const now = DateTime.now();
            const threshold = now.minus({ minutes: this.settings.checkIntervalMinutes + 1 });
            if (targetDateTime < threshold) {
                status = 'missed';
            }
        }

        return {
            id: `${filePath}:${lineStart}`,
            targetDateTime,
            comment,
            status,
            history,
            filePath,
            lineStart,
            lineEnd,
            recurrence
        };
    }

    processNotifiactorBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const data = this.parseBlock(source, ctx.sourcePath, 0, 0); // Line numbers not accurate here
        if (!data) {
            el.createEl('pre', { text: source });
            return;
        }

        const container = el.createDiv({ cls: 'notificator-block' });
        container.style.border = "1px solid var(--background-modifier-border)";
        container.style.padding = "10px";
        container.style.borderRadius = "4px";

        const header = container.createDiv({ cls: 'notificator-header' });
        header.createEl('b', { text: `${data.targetDateTime.toFormat('dd.MM.yyyy HH:mm')}${data.recurrence ? ' 🔄 ' + data.recurrence : ''} - ${data.status.toUpperCase()}` });
        container.createEl('div', { text: data.comment });

        const historyEl = container.createEl('details');
        historyEl.createEl('summary', { text: 'History' });
        const list = historyEl.createEl('ul');
        const lines = source.trim().split('\n');
        const historyIdx = lines.indexOf('-- history');
        if (historyIdx !== -1) {
            lines.slice(historyIdx + 1).forEach(h => list.createEl('li', { text: h }));
        }

        const btnGroup = container.createDiv();
        btnGroup.style.marginTop = "10px";
        btnGroup.style.display = "flex";
        btnGroup.style.gap = "5px";

        ['ok', 'cancel', 'postpone'].forEach(action => {
            const btn = btnGroup.createEl('button', { text: action });
            btn.onclick = async () => {
                const actionDetail = action === 'ok' ? 'ok status' : (action === 'cancel' ? 'cancel status' : action);
                if (action === 'postpone') {
                    new PostponeModal(this.app, async (newTime) => {
                        await this.updateNotificationStatus(ctx.sourcePath, source, `postpone - ${newTime}`, newTime);
                    }).open();
                } else {
                    await this.updateNotificationStatus(ctx.sourcePath, source, actionDetail, undefined, data.recurrence);
                }
            };
        });
    }

    async updateNotificationStatus(filePath: string, oldSource: string, statusDetail: string, newTargetTime?: string, recurrence?: string) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;

        const content = await this.app.vault.read(file);
        const now = DateTime.now().toFormat('dd.MM.yyyy HH:mm');
        
        let lines = oldSource.trim().split('\n');
        let mainLine = lines[0];
        
        if (statusDetail === 'ok status' && recurrence) {
            const currentDateTimeMatch = mainLine.match(/^\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}/);
            if (currentDateTimeMatch) {
                const currentDateTime = DateTime.fromFormat(currentDateTimeMatch[0], 'dd.MM.yyyy HH:mm');
                const nextDateTime = this.calculateNextOccurrence(currentDateTime, recurrence);
                if (nextDateTime) {
                    const nextTargetStr = nextDateTime.toFormat('dd.MM.yyyy HH:mm');
                    mainLine = mainLine.replace(/^\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}/, nextTargetStr);
                    lines[0] = mainLine;
                    statusDetail = `completed and scheduled for ${nextTargetStr}`;
                }
            }
        } else if (newTargetTime) {
            // Replace time in the first line
            mainLine = mainLine.replace(/^\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}/, newTargetTime);
            lines[0] = mainLine;
        }

        let historyIdx = lines.indexOf('-- history');
        if (historyIdx === -1) {
            lines.push('-- history');
            historyIdx = lines.length - 1;
        }
        
        lines.push(`${now} ${statusDetail}`);
        const newBlock = lines.join('\n');

        const updatedContent = content.replace(oldSource.trim(), newBlock);
        await this.app.vault.modify(file, updatedContent);
        new Notice(`Status updated to ${statusDetail}`);
    }

    checkNotifications() {
        const now = DateTime.now();
        const threshold = now.minus({ minutes: this.settings.checkIntervalMinutes + 1 });
        
        this.notifications.forEach(n => {
            if ((n.status === 'pending' || n.status === 'postponed') && n.targetDateTime <= now) {
                // If the notification is not too old, show it
                if (n.targetDateTime >= threshold) {
                    this.showSystemNotification(n);
                }
                
                // Mark as missed in memory to avoid duplicate alerts until file is scanned again
                // or until user marks it as 'ok'
                n.status = 'missed';
                n.lastMissedAlert = now;
            } else if (n.status === 'missed') {
                const interval = this.settings.missedReminderIntervalMinutes;
                if (interval > 0) {
                    const lastAlert = n.lastMissedAlert || n.targetDateTime;
                    if (now.diff(lastAlert, 'minutes').minutes >= interval) {
                        this.showSystemNotification(n, true);
                        n.lastMissedAlert = now;
                    }
                }
            }
        });
    }

    calculateNextOccurrence(current: DateTime, rule: string): DateTime | null {
        rule = rule.toLowerCase().trim();
        
        // Match "every N weeks"
        const everyWeeksMatch = rule.match(/every (\d+) weeks?/);
        if (everyWeeksMatch) {
            const weeks = parseInt(everyWeeksMatch[1]);
            return current.plus({ weeks });
        }

        // Match "every N months" or "every month on N"
        const everyMonthOnMatch = rule.match(/every month on (\d+)/);
        if (everyMonthOnMatch) {
            const day = parseInt(everyMonthOnMatch[1]);
            let next = current.plus({ months: 1 }).set({ day });
            if (!next.isValid) { // e.g. Feb 31
                 next = current.plus({ months: 1 }).endOf('month').startOf('day').set({ hour: current.hour, minute: current.minute });
            }
            return next;
        }

        if (rule.includes('every month')) {
            return current.plus({ months: 1 });
        }

        // Match "every [day of week]"
        const days = {
            'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 7,
            'пн': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'пт': 5, 'сб': 6, 'вс': 7,
            'понедельник': 1, 'вторник': 2, 'среда': 3, 'четверг': 4, 'пятница': 5, 'суббота': 6, 'воскресенье': 7
        };

        for (const [dayName, dayNum] of Object.entries(days)) {
            if (rule.includes(dayName)) {
                let next = current.plus({ days: 1 });
                while (next.weekday !== dayNum) {
                    next = next.plus({ days: 1 });
                }
                return next;
            }
        }

        // Default: plus 1 day if "every day" or unknown
        if (rule.includes('day')) {
            return current.plus({ days: 1 });
        }

        return null;
    }

    showSystemNotification(n: NotificationData, isReminder: boolean = false) {
        const title = isReminder ? "Notificator Reminder:" : "Notificator";
        const notification = new Notification(title, {
            body: `${n.comment}\nClick to open note`,
            silent: false
        });

        notification.onclick = () => {
            this.app.workspace.openLinkText(n.filePath, n.filePath);
            window.focus();
        };
        
        new Notice(`${isReminder ? 'Reminder: ' : 'Notification: '}${n.comment}`);
    }
}

class NotificationModal extends Modal {
    plugin: NotificatorPlugin;
    result: { date: string, time: string, comment: string, emoji: string, recurrence: string };
    onSubmit: (result: { date: string, time: string, comment: string, emoji: string, recurrence: string }) => void;

    recurrenceType: string = 'none';
    recurrenceValue: string = '';

    constructor(app: App, plugin: NotificatorPlugin, onSubmit: (result: { date: string, time: string, comment: string, emoji: string, recurrence: string }) => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.result = { 
            date: DateTime.now().toFormat('yyyy-MM-dd'), 
            time: DateTime.now().toFormat('HH:mm'), 
            comment: '',
            emoji: '',
            recurrence: ''
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "New Notification" });

        const emojis = this.plugin.settings.emojis.split(',').map(e => e.trim()).filter(e => e.length > 0);
        if (emojis.length > 0) {
            const emojiContainer = contentEl.createDiv({ cls: 'notificator-emoji-container' });
            emojiContainer.style.display = "flex";
            emojiContainer.style.gap = "10px";
            emojiContainer.style.marginBottom = "20px";
            emojiContainer.style.fontSize = "24px";

            emojis.forEach(emoji => {
                const span = emojiContainer.createEl("span", { text: emoji });
                span.style.cursor = "pointer";
                span.style.padding = "5px";
                span.style.borderRadius = "4px";
                span.style.border = "1px solid transparent";

                span.onclick = () => {
                    this.result.emoji = emoji;
                    // Reset others
                    Array.from(emojiContainer.children).forEach(child => (child as HTMLElement).style.border = "1px solid transparent");
                    span.style.border = "1px solid var(--interactive-accent)";
                };
            });
        }

        new Setting(contentEl)
            .setName("Date")
            .addText((text) => {
                text.inputEl.type = "date";
                text.setValue(this.result.date);
                text.onChange((value) => (this.result.date = value));
            });

        new Setting(contentEl)
            .setName("Time")
            .addText((text) => {
                text.inputEl.type = "time";
                text.setValue(this.result.time);
                text.onChange((value) => (this.result.time = value));
            });

        new Setting(contentEl)
            .setName("Comment")
            .addTextArea((text) => {
                text.onChange((value) => (this.result.comment = value));
            });

        contentEl.createEl("h3", { text: "Recurrence" });

        const recurrenceContainer = contentEl.createDiv();
        
        const renderRecurrenceOptions = () => {
            recurrenceContainer.empty();
            
            new Setting(recurrenceContainer)
                .setName("Type")
                .addDropdown(dropdown => {
                    dropdown
                        .addOption('none', 'None')
                        .addOption('daily', 'Every day')
                        .addOption('weekly', 'Weekly')
                        .addOption('monthly', 'Monthly')
                        .addOption('custom', 'Custom')
                        .setValue(this.recurrenceType)
                        .onChange(value => {
                            this.recurrenceType = value;
                            this.recurrenceValue = '';
                            if (value === 'weekly') this.recurrenceValue = 'monday';
                            if (value === 'monthly') this.recurrenceValue = '1';
                            renderRecurrenceOptions();
                        });
                });

            if (this.recurrenceType === 'weekly') {
                new Setting(recurrenceContainer)
                    .setName("Day of week")
                    .addDropdown(dropdown => {
                        dropdown
                            .addOption('monday', 'Monday')
                            .addOption('tuesday', 'Tuesday')
                            .addOption('wednesday', 'Wednesday')
                            .addOption('thursday', 'Thursday')
                            .addOption('friday', 'Friday')
                            .addOption('saturday', 'Saturday')
                            .addOption('sunday', 'Sunday')
                            .setValue(this.recurrenceValue)
                            .onChange(value => this.recurrenceValue = value);
                    });
            } else if (this.recurrenceType === 'monthly') {
                new Setting(recurrenceContainer)
                    .setName("Day of month")
                    .addText(text => {
                        text.setPlaceholder("1-31")
                            .setValue(this.recurrenceValue)
                            .onChange(value => this.recurrenceValue = value);
                    });
            } else if (this.recurrenceType === 'custom') {
                new Setting(recurrenceContainer)
                    .setName("Custom rule")
                    .setDesc("e.g., every 2 weeks")
                    .addText(text => {
                        text.setPlaceholder("every 2 weeks")
                            .setValue(this.recurrenceValue)
                            .onChange(value => this.recurrenceValue = value);
                    });
            }
        };

        renderRecurrenceOptions();

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Create")
                    .setCta()
                    .onClick(() => {
                        // Build recurrence string
                        if (this.recurrenceType === 'none') {
                            this.result.recurrence = '';
                        } else if (this.recurrenceType === 'daily') {
                            this.result.recurrence = 'every day';
                        } else if (this.recurrenceType === 'weekly') {
                            this.result.recurrence = `every ${this.recurrenceValue}`;
                        } else if (this.recurrenceType === 'monthly') {
                            this.result.recurrence = `every month on ${this.recurrenceValue}`;
                        } else if (this.recurrenceType === 'custom') {
                            this.result.recurrence = this.recurrenceValue;
                        }

                        // Convert ISO date to DD.MM.YYYY
                        const d = DateTime.fromISO(this.result.date);
                        const formattedDate = d.toFormat('dd.MM.yyyy');
                        this.close();
                        this.onSubmit({ ...this.result, date: formattedDate });
                    })
            );
    }
}

class PostponeModal extends Modal {
    result: { date: string, time: string };
    onSubmit: (newTime: string) => void;

    constructor(app: App, onSubmit: (newTime: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.result = { 
            date: DateTime.now().toFormat('yyyy-MM-dd'), 
            time: DateTime.now().toFormat('HH:mm')
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Postpone Notification" });

        new Setting(contentEl)
            .setName("New Date")
            .addText((text) => {
                text.inputEl.type = "date";
                text.setValue(this.result.date);
                text.onChange((value) => (this.result.date = value));
            });

        new Setting(contentEl)
            .setName("New Time")
            .addText((text) => {
                text.inputEl.type = "time";
                text.setValue(this.result.time);
                text.onChange((value) => (this.result.time = value));
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Postpone")
                    .setCta()
                    .onClick(() => {
                        const d = DateTime.fromISO(this.result.date);
                        const newTime = `${d.toFormat('dd.MM.yyyy')} ${this.result.time}`;
                        this.close();
                        this.onSubmit(newTime);
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class NotificatorSettingTab extends PluginSettingTab {
    plugin: NotificatorPlugin;

    constructor(app: App, plugin: NotificatorPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl)
            .setName('Check Interval (minutes)')
            .setDesc('How often to check for due notifications')
            .addSlider(slider => slider
                .setLimits(1, 60, 1)
                .setValue(this.plugin.settings.checkIntervalMinutes)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.checkIntervalMinutes = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Missed Reminder Interval (minutes)')
            .setDesc('How often to remind about missed notifications (0 to disable)')
            .addSlider(slider => slider
                .setLimits(0, 1440, 5)
                .setValue(this.plugin.settings.missedReminderIntervalMinutes)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.missedReminderIntervalMinutes = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Emojis')
            .setDesc('Comma-separated list of emojis for the widget')
            .addText(text => text
                .setValue(this.plugin.settings.emojis)
                .onChange(async (value) => {
                    this.plugin.settings.emojis = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('a', { text: 'emoji source', href:'https://en.wikipedia.org/wiki/List_of_emojis' });
        containerEl.createEl('h3', { text: 'How to use' });
        const usageList = containerEl.createEl('ul');
        usageList.createEl('li', { text: 'Use the command "Insert Notification" to create a new reminder block.' });
        usageList.createEl('li', { text: 'The block starts with a date and time (DD.MM.YYYY HH:mm) followed by a comment.' });
        usageList.createEl('li', { text: 'The plugin scans your notes every minute (configurable) and shows system notifications.' });
        usageList.createEl('li', { text: 'Use the "Calendar View" command to see all upcoming and past notifications.' });
        usageList.createEl('li', { text: 'You can manage notification statuses (OK, Cancel, Postpone) directly in the note block.' });

    }
}
