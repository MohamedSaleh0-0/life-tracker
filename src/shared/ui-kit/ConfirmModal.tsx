// Generic confirm/cancel modal — no React needed, just Obsidian's own
// Modal/Setting API (same pattern as HabitDeleteConfirmModal, but
// generalized so Data Point Tracking and, later, Money Management can
// reuse it instead of each module writing its own variant).

import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private message: string,
    private onConfirm: () => void | Promise<void>,
    private confirmLabel = 'Delete'
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.title });
    contentEl.createEl('p', { text: this.message });

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((btn) =>
        btn
          .setButtonText(this.confirmLabel)
          .setWarning()
          .onClick(async () => {
            await this.onConfirm();
            this.close();
          })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
