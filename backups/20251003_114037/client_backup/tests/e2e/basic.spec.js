import { test, expect } from '@playwright/test';

test.describe('Basic Application Tests', () => {
  test('should load a simple HTML page', async ({ page }) => {
    // Create a simple HTML page for testing
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <h1>National Parks Explorer</h1>
          <p>Welcome to our testing page</p>
          <button id="test-button">Click Me</button>
        </body>
      </html>
    `);

    // Test basic page elements
    await expect(page).toHaveTitle('Test Page');
    await expect(page.locator('h1')).toContainText('National Parks Explorer');
    await expect(page.locator('p')).toContainText('Welcome to our testing page');
    await expect(page.locator('#test-button')).toBeVisible();
  });

  test('should handle button clicks', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <button id="test-button">Click Me</button>
          <div id="result"></div>
          <script>
            document.getElementById('test-button').addEventListener('click', () => {
              document.getElementById('result').textContent = 'Button clicked!';
            });
          </script>
        </body>
      </html>
    `);

    // Test button interaction
    await expect(page.locator('#result')).toHaveText('');
    await page.click('#test-button');
    await expect(page.locator('#result')).toHaveText('Button clicked!');
  });

  test('should handle form inputs', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <form id="test-form">
            <input type="text" id="name" placeholder="Enter your name">
            <input type="email" id="email" placeholder="Enter your email">
            <button type="submit">Submit</button>
          </form>
          <div id="result"></div>
          <script>
            document.getElementById('test-form').addEventListener('submit', (e) => {
              e.preventDefault();
              const name = document.getElementById('name').value;
              const email = document.getElementById('email').value;
              document.getElementById('result').textContent = \`Hello \${name}, your email is \${email}\`;
            });
          </script>
        </body>
      </html>
    `);

    // Test form interaction
    await page.fill('#name', 'John Doe');
    await page.fill('#email', 'john@example.com');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('#result')).toContainText('Hello John Doe, your email is john@example.com');
  });

  test('should handle navigation', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <nav>
            <a href="#home">Home</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </nav>
          <div id="content">
            <div id="home" class="page">Home Page Content</div>
            <div id="about" class="page" style="display: none;">About Page Content</div>
            <div id="contact" class="page" style="display: none;">Contact Page Content</div>
          </div>
          <script>
            document.querySelectorAll('nav a').forEach(link => {
              link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.target.getAttribute('href').substring(1);
                document.querySelectorAll('.page').forEach(page => {
                  page.style.display = 'none';
                });
                document.getElementById(target).style.display = 'block';
              });
            });
          </script>
        </body>
      </html>
    `);

    // Test navigation
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('#about')).not.toBeVisible();
    
    await page.click('a[href="#about"]');
    await expect(page.locator('#home')).not.toBeVisible();
    await expect(page.locator('#about')).toBeVisible();
    await expect(page.locator('#about')).toContainText('About Page Content');
  });

  test('should handle responsive design', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .container { 
              display: flex; 
              flex-direction: column; 
            }
            @media (min-width: 768px) {
              .container { 
                flex-direction: row; 
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div>Sidebar</div>
            <div>Main Content</div>
          </div>
        </body>
      </html>
    `);

    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    const container = page.locator('.container');
    await expect(container).toHaveCSS('flex-direction', 'column');

    // Test desktop view
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(container).toHaveCSS('flex-direction', 'row');
  });
});
