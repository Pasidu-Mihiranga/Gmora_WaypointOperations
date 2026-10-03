import { expect, test } from '@playwright/test'

const apiBase = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '8080'}`

test('store manager reviews and confirms an order or sees an existing-order conflict', async ({ page }) => {
  const password = process.env.SEED_STORE_MANAGER_PASSWORD
  if (!password) throw new Error('Configure SEED_STORE_MANAGER_PASSWORD before running browser tests')

  await page.goto('/login')
  await page.getByLabel('USER ID', { exact: true }).fill(process.env.SEED_STORE_MANAGER_USERNAME ?? 'STM-001')
  await page.getByLabel('PASSWORD', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/\/store$/)

  await page.goto('/store/orders/new')
  await expect(page.getByRole('heading', { name: 'Place Order' })).toBeVisible()

  for (const temp of ['ambient', 'chilled'] as const) {
    await page.getByRole('radio', { name: new RegExp(temp, 'i') }).check({ force: true })
    await page.getByLabel('Units').fill('3')
    // The server estimates weight and volume from past orders; wait for it before reviewing.
    await expect(page.getByText(/Estimated from|no past orders to estimate from/i)).toBeVisible()
    if (!(await page.getByLabel('Weight (kg)').inputValue())) {
      await page.getByLabel('Weight (kg)').fill('22.5')
      await page.getByLabel('Volume (m³)').fill('0.125')
    }
    await page.getByRole('button', { name: 'Continue to Review' }).click()
    await page.getByRole('button', { name: 'Submit Order' }).click()

    const confirmed = page.getByText(/order submitted/i)
    const duplicate = page.getByText(/already have an active order/i)
    await expect(confirmed.or(duplicate)).toBeVisible({ timeout: 15_000 })
    if (await confirmed.isVisible()) {
      await expect(page.getByText(/ORD-/)).toBeVisible()
      break
    }
    // Repeat runs may already hold this temperature; verify the conflict and try the other.
    await expect(page.getByRole('heading', { name: 'Place Order' })).toBeVisible()
  }

  const me = await page.request.get(`${apiBase}/api/v1/auth/me`)
  expect(me.status()).toBe(200)
  const cutoff = await page.request.get(`${apiBase}/api/v1/store/cutoff`)
  expect(cutoff.status()).toBe(200)
  const deliveryDate = (await cutoff.json()).nextDeliveryDate
  const orders = await page.request.get(`${apiBase}/api/v1/store/orders?date=${deliveryDate}`)
  expect(orders.status()).toBe(200)
  const persisted = (await orders.json()).items
  expect(persisted.some((order: { status: string; orderDate: string }) => order.status === 'confirmed' && order.orderDate === deliveryDate)).toBe(true)
})
