import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ImportDialogData {
  credentialId: string;
  exchange: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
}

type ImportType = 'deposits' | 'withdrawals' | 'transactions';

@Component({
  selector: 'app-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="import-dialog">
      <h2 mat-dialog-title>Importar datos de Binance</h2>

      <mat-dialog-content>
        <div class="form-section">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Tipo de archivo</mat-label>
            <mat-select [(value)]="selectedType">
              <mat-option value="deposits">
                <mat-icon>arrow_downward</mat-icon>
                Deposit History (Historial de depósitos)
              </mat-option>
              <mat-option value="withdrawals">
                <mat-icon>arrow_upward</mat-icon>
                Withdraw History (Historial de retiros)
              </mat-option>
              <mat-option value="transactions">
                <mat-icon>swap_horiz</mat-icon>
                Transaction History (Intereses, trades, etc.)
              </mat-option>
            </mat-select>
          </mat-form-field>
        </div>

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
            <mat-icon class="file-icon">description</mat-icon>
            <p class="file-name">{{ selectedFile.name }}</p>
            <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
            <button mat-button color="warn" (click)="removeFile($event)">
              <mat-icon>close</mat-icon>
              Quitar archivo
            </button>
          } @else {
            <mat-icon class="upload-icon">cloud_upload</mat-icon>
            <p class="drop-text">Arrastra el archivo aquí</p>
            <p class="drop-hint">o haz click para seleccionar</p>
            <p class="file-types">Solo archivos .xlsx</p>
          }

          <input
            #fileInput
            type="file"
            hidden
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            (change)="onFileSelected($event)">
        </div>

        @if (result) {
          <div class="result-container" [class.success]="result.errors === 0" [class.warning]="result.errors > 0">
            <mat-icon>{{ result.errors === 0 ? 'check_circle' : 'warning' }}</mat-icon>
            <div class="result-text">
              <span class="result-title">Importación completada</span>
              <span class="result-details">
                {{ result.imported }} importados, {{ result.skipped }} omitidos
                @if (result.errors > 0) {
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
          (click)="onImport()"
          [disabled]="!canImport()">
          @if (uploading) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            <ng-container>
              <mat-icon>upload</mat-icon>
              Importar
            </ng-container>
          }
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .import-dialog {
      min-width: 450px;
    }

    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--text-primary);
    }

    mat-dialog-content {
      padding-top: 16px !important;
    }

    .form-section {
      margin-bottom: 20px;
    }

    .full-width {
      width: 100%;
    }

    ::ng-deep .mat-mdc-option mat-icon {
      margin-right: 8px;
      font-size: 20px;
      width: 20px;
      height: 20px;
      vertical-align: middle;
    }

    .drop-zone {
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
      margin: 0 0 12px 0;
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
      padding: 16px 0 0 0;
      gap: 8px;
    }

    mat-dialog-actions button mat-icon {
      margin-right: 4px;
    }

    mat-dialog-actions mat-spinner {
      margin-right: 8px;
    }
  `]
})
export class ImportDialogComponent {
  selectedType: ImportType = 'deposits';
  selectedFile: File | null = null;
  isDragOver = false;
  uploading = false;
  result: ImportResult | null = null;
  error: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<ImportDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ImportDialogData,
    private http: HttpClient
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
    if (!file.name.endsWith('.xlsx')) {
      this.error = 'Solo se aceptan archivos Excel (.xlsx)';
      return;
    }

    this.selectedFile = file;
    this.error = null;
    this.result = null;
  }

  removeFile(event: Event): void {
    event.stopPropagation();
    this.selectedFile = null;
    this.result = null;
    this.error = null;
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

    const formData = new FormData();
    formData.append('file', this.selectedFile);

    const endpoint = `${environment.apiUrl}/imports/binance-${this.selectedType}/${this.data.credentialId}`;

    this.http.post<ImportResult>(endpoint, formData).subscribe({
      next: (result) => {
        this.uploading = false;
        this.result = result;
        this.selectedFile = null;
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
