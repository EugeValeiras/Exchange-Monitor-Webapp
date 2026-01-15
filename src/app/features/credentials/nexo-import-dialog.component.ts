import { Component, Inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CredentialsService } from '../../core/services/credentials.service';

export interface NexoImportDialogData {
  credentialId: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors?: number;
}

@Component({
  selector: 'app-nexo-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="import-dialog">
      <h2 mat-dialog-title>Importar datos de Nexo</h2>

      <mat-dialog-content>
        <p class="instructions">
          Exporta tu historial de transacciones desde Nexo en formato CSV y súbelo aquí.
        </p>

        <div
          class="drop-zone"
          [class.dragover]="isDragOver"
          [class.has-file]="selectedFile"
          [class.uploading]="uploading"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDrop($event)"
          (click)="fileInput.click()">

          @if (uploading) {
            <mat-spinner diameter="48"></mat-spinner>
            <p class="drop-text">Importando...</p>
          } @else if (selectedFile) {
            <button class="remove-file-btn" (click)="removeFile($event)" matTooltip="Quitar archivo">
              <mat-icon>close</mat-icon>
            </button>
            <mat-icon class="file-icon">description</mat-icon>
            <p class="file-name">{{ selectedFile.name }}</p>
            <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
            @if (parsingFile) {
              <p class="record-count parsing">
                <mat-spinner diameter="14"></mat-spinner>
                Analizando archivo...
              </p>
            } @else if (recordCount !== null) {
              <p class="record-count">
                <mat-icon>list</mat-icon>
                {{ recordCount | number }} registros encontrados
              </p>
            }
          } @else {
            <mat-icon class="upload-icon">cloud_upload</mat-icon>
            <p class="drop-text">Arrastra el archivo aquí</p>
            <p class="drop-hint">o haz click para seleccionar</p>
            <p class="file-types">Solo archivos .csv</p>
          }

          <input
            #fileInput
            type="file"
            hidden
            accept=".csv,text/csv"
            (change)="onFileSelected($event)">
        </div>

        @if (result) {
          <div class="result-container" [class.success]="!result.errors || result.errors === 0" [class.warning]="result.errors && result.errors > 0">
            <mat-icon>{{ !result.errors || result.errors === 0 ? 'check_circle' : 'warning' }}</mat-icon>
            <div class="result-text">
              <span class="result-title">Importación completada</span>
              <span class="result-details">
                {{ result.imported }} importados, {{ result.skipped }} omitidos
                @if (result.errors && result.errors > 0) {
                  , {{ result.errors }} errores
                }
              </span>
            </div>
          </div>
        }

        @if (error) {
          <div class="error-container">
            <mat-icon>error</mat-icon>
            <span>{{ error }}</span>
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="onCancel()" [disabled]="uploading">Cancelar</button>
        <button
          mat-raised-button
          color="primary"
          class="import-btn"
          (click)="onImport()"
          [disabled]="!canImport() || uploading">
          <mat-spinner *ngIf="uploading" diameter="18"></mat-spinner>
          <mat-icon *ngIf="!uploading">upload</mat-icon>
          <span>{{ uploading ? 'Importando...' : 'Importar' }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--text-primary);
    }

    mat-dialog-content {
      padding-top: 16px !important;
      overflow: visible !important;
      max-height: none !important;
    }

    .instructions {
      color: var(--text-secondary);
      font-size: 14px;
      margin: 0 0 20px 0;
    }

    .drop-zone {
      position: relative;
      border: 2px dashed var(--border-color);
      border-radius: 12px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background: var(--bg-elevated);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 180px;
    }

    .remove-file-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 50%;
      background: rgba(246, 70, 93, 0.15);
      color: var(--color-error);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &:hover {
        background: rgba(246, 70, 93, 0.25);
        transform: scale(1.1);
      }
    }

    .drop-zone:hover:not(.uploading) {
      border-color: var(--brand-primary);
      background: rgba(240, 185, 11, 0.05);
    }

    .drop-zone.dragover {
      border-color: var(--brand-primary);
      background: rgba(240, 185, 11, 0.1);
      transform: scale(1.02);
    }

    .drop-zone.has-file {
      border-color: var(--color-success);
      border-style: solid;
      background: rgba(14, 203, 129, 0.05);

      &:hover:not(.uploading) {
        border-color: var(--brand-primary);
        background: rgba(240, 185, 11, 0.05);
      }
    }

    .drop-zone.uploading {
      cursor: not-allowed;
      opacity: 0.7;
    }

    .upload-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--text-tertiary);
      margin-bottom: 12px;
    }

    .file-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--color-success);
      margin-bottom: 8px;
    }

    .drop-text {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-primary);
      margin: 0 0 4px 0;
    }

    .drop-hint {
      font-size: 14px;
      color: var(--text-secondary);
      margin: 0 0 8px 0;
    }

    .file-types {
      font-size: 12px;
      color: var(--text-tertiary);
      margin: 0;
    }

    .file-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      margin: 0 0 4px 0;
      word-break: break-all;
    }

    .file-size {
      font-size: 12px;
      color: var(--text-secondary);
      margin: 0 0 8px 0;
    }

    .record-count {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--color-success);
      margin: 0 0 12px 0;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      &.parsing {
        color: var(--text-secondary);
      }
    }

    .result-container {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border-radius: 8px;
      margin-top: 16px;
    }

    .result-container.success {
      background: rgba(14, 203, 129, 0.1);
      border: 1px solid rgba(14, 203, 129, 0.3);
    }

    .result-container.success mat-icon {
      color: var(--color-success);
    }

    .result-container.warning {
      background: rgba(240, 185, 11, 0.1);
      border: 1px solid rgba(240, 185, 11, 0.3);
    }

    .result-container.warning mat-icon {
      color: var(--brand-primary);
    }

    .result-text {
      display: flex;
      flex-direction: column;
    }

    .result-title {
      font-weight: 600;
      color: var(--text-primary);
      font-size: 14px;
    }

    .result-details {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .error-container {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      border-radius: 8px;
      margin-top: 16px;
      background: rgba(246, 70, 93, 0.1);
      border: 1px solid rgba(246, 70, 93, 0.3);
      color: var(--color-error);
      font-size: 13px;
    }

    mat-dialog-actions {
      padding: 16px 16px 0 16px;
      gap: 8px;
    }

    .import-btn {
      min-width: 130px;

      .mdc-button__label {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }

      mat-spinner {
        display: inline-block;
      }
    }
  `]
})
export class NexoImportDialogComponent {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  selectedFile: File | null = null;
  isDragOver = false;
  uploading = false;
  parsingFile = false;
  recordCount: number | null = null;
  result: ImportResult | null = null;
  error: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<NexoImportDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: NexoImportDialogData,
    private credentialsService: CredentialsService
  ) {}

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.uploading) {
      this.isDragOver = true;
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    if (this.uploading) return;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private handleFile(file: File): void {
    if (!file.name.endsWith('.csv')) {
      this.error = 'Solo se aceptan archivos CSV (.csv)';
      return;
    }

    this.selectedFile = file;
    this.error = null;
    this.result = null;
    this.recordCount = null;
    this.parsingFile = true;

    // Parse CSV file to count records
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        // Subtract 1 for header row
        this.recordCount = Math.max(0, lines.length - 1);
        this.parsingFile = false;
      } catch {
        this.parsingFile = false;
        this.recordCount = null;
      }
    };
    reader.onerror = () => {
      this.parsingFile = false;
      this.recordCount = null;
    };
    reader.readAsText(file);
  }

  removeFile(event: Event): void {
    event.stopPropagation();
    this.selectedFile = null;
    this.recordCount = null;
    this.result = null;
    this.error = null;
    // Reset file input to allow re-selecting the same file
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  canImport(): boolean {
    return !!this.selectedFile && !this.uploading;
  }

  onImport(): void {
    if (!this.selectedFile || this.uploading) return;

    this.uploading = true;
    this.error = null;
    this.result = null;

    this.credentialsService.importCsv(this.data.credentialId, this.selectedFile).subscribe({
      next: (result) => {
        this.uploading = false;
        this.result = result;
        this.selectedFile = null;
        this.recordCount = null;
        // Reset file input
        if (this.fileInput?.nativeElement) {
          this.fileInput.nativeElement.value = '';
        }
      },
      error: (err) => {
        this.uploading = false;
        this.error = err.error?.message || 'Error al importar el archivo';
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close(this.result);
  }
}
