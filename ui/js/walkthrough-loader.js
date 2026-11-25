// The large hash-matched translation tables are loaded only where actually displayed.
export async function walkthroughReader(language, source = 'walkthrough') {
  if (!['es', 'zh'].includes(language) || source === 'imported') return step => step.text;
  const { walkthroughStep } = await import('./walkthrough-locales.js');
  return step => walkthroughStep(step, language);
}
