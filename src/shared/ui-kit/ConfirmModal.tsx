// Generic confirm/cancel modal — no React needed, just Obsidian's own
// Modal/Setting API.

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

/**
 * Promise-based wrapper around ConfirmModal for call sites that need
 * to `await` the user's choice inline (e.g. "does the user want to
 * proceed after a budget-overage warning?") rather than structuring
 * the rest of the flow around a callback. Resolves `true` only if the
 * confirm button was pressed; resolves `false` for Cancel, the X
 * button, or clicking outside the modal — any way of closing without
 * confirming.
 */
export function confirmAsync(
  app: App,
  title: string,
  message: string,
  confirmLabel = 'Continue anyway'
): Promise<boolean> {
  return new Promise((resolve) => {
    let confirmed = false;
    const modal = new ConfirmModal(
      app,
      title,
      message,
      () => {
        confirmed = true;
      },
      confirmLabel
    );
    const originalOnClose = modal.onClose.bind(modal);
    modal.onClose = () => {
      originalOnClose();
      resolve(confirmed);
    };
    modal.open();
  });
}
