// Download/print a community exercise as the branded PDF (web). Mirrors
// rhythm-builder's runPdfExport, but driven by a stored config so the
// community detail screen can offer "Download PDF" without the Builder.

import { buildExerciseHtml } from '@/lib/export/buildExerciseHtml';

import { resolveExerciseConfig, type ExerciseConfig } from './exerciseConfig';

export function downloadExercisePdf(title: string, config: ExerciseConfig): void {
  if (typeof window === 'undefined') return;
  const { pitches, keySignature, clef, patterns } = resolveExerciseConfig(config);
  if (pitches.length === 0) return;
  const finalTitle = title.trim().length > 0 ? title.trim() : 'Exercise';
  const html = buildExerciseHtml(finalTitle, pitches, keySignature, clef, patterns);
  const w = window.open('', '_blank');
  if (!w) {
    window.alert(
      'PDF export needs a popup window. Please allow popups for this site and try again.',
    );
    return;
  }
  const printTrigger = `<script>
    window.addEventListener('load', function () {
      setTimeout(function () { try { window.focus(); window.print(); } catch (e) {} }, 700);
    });
  </script>`;
  w.document.open();
  w.document.write(html.replace('</body>', printTrigger + '</body>'));
  w.document.close();
}
