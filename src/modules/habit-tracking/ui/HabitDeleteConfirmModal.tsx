// Delete confirmation, shown only when the habit has existing logged
// history (REQ-H015).

import { App, Modal, Setting } from 'obsidian';
import { HabitService } from '../application/habitService';
import { HabitDefinition } from '../domain/types';

export class HabitDeleteConfirmModal extends Modal {
  constructor(
    app: App,
    private habitService: HabitService,
    private habit: HabitDefinition,
    private onDeleted: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: `Delete "${this.habit.name}"?` });
    contentEl.createEl('p', {
      text: 'This habit has logged history. Deleting it removes the habit definition — its historical log entries are left in place, unlinked, rather than rewritten out of your markdown files.',
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => this.close())
      )
      .addButton((btn) =>
        btn
          .setButtonText('Delete')
          .setWarning()
          .onClick(async () => {
            await this.habitService.deleteHabit(this.habit.id, true);
            this.close();
            this.onDeleted();
          })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
