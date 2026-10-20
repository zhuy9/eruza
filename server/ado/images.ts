/** Shows existing ADO attachment images through the local image route. */
export const toLocalImages = (html: string, organization: string, id: number) =>
  html.replace(
    new RegExp(
      `https://dev\\.azure\\.com/${organization}/(?:[^/"'\\s]+/)?_apis/wit/attachments/([0-9a-f-]{36})(\\?[^"'\\s<>]*)?`,
      'gi',
    ),
    (_, guid: string, query = '') => `/api/work-items/${id}/images/${guid}${query}`,
  );

/** Restores ADO attachment URLs before HTML is saved. */
export const toAdoImages = (html: string, organization: string) =>
  html.replace(
    /\/api\/work-items\/\d+\/images\/([0-9a-f-]{36})(\?[^"'\s<>]*)?/gi,
    (_, guid: string, query = '') =>
      `https://dev.azure.com/${organization}/_apis/wit/attachments/${guid}${query}`,
  );
