export async function drawPolygon(page, ring) {
  await page.locator('#sketch').getByRole('button', { name: 'Polygon', exact: true }).click();
  for (const coordinate of ring) {
    const point = await page.locator('#measurement').evaluate((node, location) => {
      const projected = node.map.project(location);
      return { x: projected.x, y: projected.y };
    }, coordinate);
    await page.locator('#map canvas').click({ position: point });
  }
}
