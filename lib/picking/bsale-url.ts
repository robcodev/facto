const origin = 'https://api.bsale.io';

export function bsaleResourceUrl(resource: string) {
    const path = resource.trim();
    if (!path || path.startsWith('//') || path.includes('\\')) throw new Error('Bsale entregó una URL de recurso no permitida.');
    // Webhooks include their version (/v2/token/checkout/...). Legacy internal
    // callers use unversioned paths such as /cart/123/detail.json under /v1.
    const url = new URL(/^https?:\/\//i.test(path) ? path
        : /^\/v\d+\//.test(path) ? origin + path
        : origin + '/v1/' + path.replace(/^\//, ''));
    if (url.origin !== origin || url.username || url.password || url.hash || !/^\/v[12]\//.test(url.pathname)) {
        throw new Error('Bsale entregó una URL de recurso no permitida.');
    }
    return url.href;
}
