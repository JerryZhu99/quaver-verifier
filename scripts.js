const { ipcRenderer } = require('electron')

const mapsetPath = document.getElementById('mapset-path')
const errorContainer = document.getElementById('error-container')


async function loadMapsetFolder() {
  const data = await ipcRenderer.invoke('select-mapset');
  if (data) renderErrors(data);
}

async function refreshMapsetFolder() {
  const data = await ipcRenderer.invoke('verify-mapset');
  if (data) renderErrors(data);
}

async function renderErrors(data) {
  mapsetPath.textContent = data.directory;

  let sections = [];

  sections.push({ name: 'General', errors: data.generalErrors });
  sections = sections.concat(data.mapsetErrors);

  errorContainer.innerHTML = sections.map(({ name, errors }) => `
  <div class='my-2'>
    <div class='card'>
      <div class="card-body">
        <h5 class="card-title">${name || '(no name)'}</h5>
        <p class="card-text">
        ${errors.length > 0 ? `
        <ul>
          ${errors.map(e => e.time ? `
          <li><a href='quaver://editor/${e.time}'>
            ${e.error}
          </a></li>
          ` : `
          <li>
            ${e.error}
          </li>
          `).join('')}
        </ul>
        ` : `
          No errors!
        `}
        </p>
      </div>
    </div>
  </div>
  `).join('\n');

  console.log(data)
}