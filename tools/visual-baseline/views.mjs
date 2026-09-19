// Vistas que se capturan en cada viewport. Los selectores se basan en la estructura del DOM
// (no en clases de un framework), para poder reutilizarlos contra el port a Next.js.
export const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

export const ORDER_ID = '11111111-2222-4333-8444-555555555555';

const waitForProducts = (page) => page.locator('#all-products .product-card').first().waitFor();

export const VIEWS = [
  { name: 'home', path: '/', fullPage: true, ready: waitForProducts },
  {
    name: 'product-modal',
    path: '/',
    fullPage: false,
    ready: waitForProducts,
    async action(page) {
      await page.locator('#all-products .product-card').first().click();
      await page.getByRole('dialog').waitFor();
    },
  },
  {
    name: 'cart-drawer',
    path: '/',
    withCart: true,
    fullPage: false,
    ready: waitForProducts,
    async action(page) {
      await page.locator('header button').first().click();
      await page.getByText(/your cart/i).waitFor();
    },
  },
  { name: 'checkout', path: '/checkout', withCart: true, fullPage: true },
  { name: 'checkout-empty', path: '/checkout', fullPage: true },
  { name: 'order-success', path: `/order-success?orderId=${ORDER_ID}`, fullPage: true },
  {
    name: 'tracking',
    path: `/tracking?orderId=${ORDER_ID}`,
    fullPage: true,
    async ready(page) {
      await page.getByText(ORDER_ID, { exact: true }).waitFor();
    },
  },
  { name: 'tracking-empty', path: '/tracking', fullPage: true },
  { name: 'not-found', path: '/esta-ruta-no-existe', fullPage: true },
  { name: 'admin-login', path: '/admin/login', fullPage: true },
];
