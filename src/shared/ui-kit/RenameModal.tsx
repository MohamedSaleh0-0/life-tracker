// Generic rename/edit-text modal — reused for shopping lists,
// categories, and anything else that just needs a "change this name"
// flow, instead of every module writing its own bespoke variant.
// Mirrors ConfirmModal's plain Obsidian Modal/Setting approach (no
// React needed for something this simple).

import { App, Modal, Setting } from 'obsidian';

export class RenameModal extends Modal {
  private value: string;

  constructor(
    app: App,
    private modalTitle: string,
    private currentValue: string,
    private onSave: (newValue: string) => void | Promise<void>,
    private fieldLabel = 'Name'
  ) {
    super(app);
    this.value = currentValue;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.modalTitle });

    new Setting(contentEl).setName(this.fieldLabel).addText((text) =>
      text
        .setValue(this.currentValue)
        .onChange((v) => (this.value = v))
        .inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.save();
          }
        })
    );

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((btn) =>
        btn
          .setButtonText('Save')
          .setCta()
          .onClick(() => this.save())
      );
  }

  private async save(): Promise<void> {
    const trimmed = this.value.trim();
    if (!trimmed) return;
    await this.onSave(trimmed);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
