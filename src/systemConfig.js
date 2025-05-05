// Get access to the VS Code API from within the webview context
const vscode = acquireVsCodeApi();

const usedNodeIds = new Set();
let nodeCount = 0;

// Wait for the webview DOM to load before referencing any HTML elements or toolkit components
window.addEventListener("load", main);

const state = {
  systemInfo: {},
  supportedModels: {},
}

// Utility function to create an element with attributes
function createElement(tag, attributes = {}, innerHTML = '') {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  element.innerHTML = innerHTML;
  return element;
}

// Utility function to clear and populate a container
function clearAndPopulate(container, content) {
  container.innerHTML = '';
  container.appendChild(content);
}

// Function to render slots dynamically
function renderSlots(noOfSlots, options, id) {
  const slotContainer = createElement('div', { class: 'form-group' });

  for (let i = 1; i <= noOfSlots; i++) {
    const label = createElement('label', { for: `${id}_slot${i}` }, `slot [ ${i} ]`);
    const select = createElement('select', { id: `${id}_slot${i}`, name: `${id}_slot${i}` });

    options.forEach(option => {
      const optionElement = createElement('option', { value: option }, option);
      select.appendChild(optionElement);
    });

    slotContainer.appendChild(label);
    slotContainer.appendChild(select);
  }

  return slotContainer;
}

// Main function that gets executed once the webview DOM loads
function main() {
  vscode.postMessage({ command: "getInitialSystems" });
  setVSCodeMessageListener();
}

// Set up an event listener to listen for messages passed from the extension context
function setVSCodeMessageListener() {
  window.addEventListener("message", (event) => {
    const { command, payload } = event.data;
    if (command === "systems") {
      handleSystemsMessage(payload);
    } else if (command === "supportedModels") {
      addNewSystem(payload);
    }
  });
}

// Handle systems message and populate the UI
function handleSystemsMessage(payload) {
  const data = JSON.parse(payload);
  const { systemInfo, supportedModels, selected_system, activate } = data;
  state.supportedModels = supportedModels;
  const systemsContainer = document.getElementById('systems-container');

  // Create a dropdown for selecting system names
  const dropdown = createElement('select', { id: 'systemSelector' });
  systemInfo.forEach(system => {
    const option = createElement('option', { value: system.name }, system.name);
    dropdown.appendChild(option);
  });

  // Add event listener to render form with selected system data
  dropdown.addEventListener('change', (event) => {
    const selectedSystem = systemInfo.find(system => system.name === event.target.value);
    if (selectedSystem) {
      renderFormWithData(selectedSystem);
    }
  });

  // Clear and populate the container with the dropdown and form
  systemsContainer.innerHTML = '';
  systemsContainer.appendChild(dropdown);

  // Render the form with the initially selected system data
  if (selected_system) {
    const initialSystem = systemInfo.find(system => system.name === selected_system);
    if (initialSystem) {
      renderFormWithData(initialSystem);
    }
  }
}

function renderFormWithData(systemData) {
  const systemsContainer = document.getElementById('systems-container');

  // Create the form with pre-filled data
  const form = createAddSystemForm(state.supportedModels);

  // Clear and populate the container with the updated form
  clearAndPopulate(systemsContainer, form);

  // Re-setup form submission and accordion functionality
  setupAccordion();
  setupFormSubmission();

  form.querySelector('#systemName').value = systemData.name;
  form.querySelector('#localnode').value = systemData.localNode;

  // Render slots if available
  if (systemData.slots) {
    const localNodeSlots = form.querySelector('#localNodeSlots');
    clearAndPopulate(localNodeSlots, renderSlots(systemData.slots.length, state.supportedModels[systemData.localNode].moduleOptions, 'localNodeSlots'));
    systemData.slots.forEach((slot, index) => {
      const slotElement = localNodeSlots.querySelector(`#localNodeSlots_slot${index + 1}`);
      if (slotElement) {
        slotElement.value = slot.module;
      }
    });
  }

  // Render nodes if available
  if (systemData.nodes) {
    const nodeContainer = form.querySelector('#nodeContainer');
    systemData.nodes.forEach(node => {
      addNode();
      const nodeRow = nodeContainer.lastChild.previousSibling; // Get the last added node row
      const numberSelect = nodeRow.querySelector('.node-number');
      const modelSelect = nodeRow.querySelector('select[name$="_model"]');
      if (numberSelect) numberSelect.value = parseInt(node.nodeId.match(/\d+/)?.[0] || "", 10);
      if (modelSelect) modelSelect.value = node.mainframe;

      // Render slots for the node if available
      if (node.slots) {
        const nodeSlotsContainer = nodeRow.nextSibling; // Slots container is next to the node row
        clearAndPopulate(nodeSlotsContainer, renderSlots(node.slots.length, state.supportedModels[node.mainframe].moduleOptions, `${nodeRow.id}_slots`));
        node.slots.forEach((slot, index) => {
          const slotElement = nodeSlotsContainer.querySelector(`#${nodeRow.id}_slots_slot${index + 1}`);
          if (slotElement) {
            slotElement.value = slot.module;
          }
        });
      }
    });
    // Expand the node accordion
    const accordionContent = document.getElementById('accordionContent');
    const accordionButton = document.getElementById('accordionToggle');
    accordionContent.classList.add('show');
    accordionButton.setAttribute('aria-expanded', true);
  }


}

// Render local node slots dynamically
function renderNodeSlots(id, selectedValue) {
  const localNodeSlots = document.getElementById(id);
  const details = state.supportedModels[selectedValue];
  localNodeSlots.innerHTML = ""

  if (details?.noOfSlots) {
    clearAndPopulate(localNodeSlots, renderSlots(details.noOfSlots, details.moduleOptions, id));
  }
}

// Add a new system dynamically
function addNewSystem(payload) {
  const data = JSON.parse(payload);
  state.supportedModels = data.supportedModels;
  const systemsContainer = document.getElementById('systems-container');

  clearAndPopulate(systemsContainer, createAddSystemForm(state.supportedModels));

  const localNode = document.getElementById('localnode');
  localNode.addEventListener('change', () => renderNodeSlots('localNodeSlots', localNode.value));

  setupAccordion();
  setupFormSubmission();
}

// Create the add system form
function createAddSystemForm(supportedModels) {
  const options = Object.keys(supportedModels)
    .map(model => `<option value="${model}">${model}</option>`)
    .join('');

  const form = createElement('form', { id: 'dynamicForm', novalidate: '' }, `
    <div class="form-group">
      <label for="systemName">System Name:</label>
      <input type="text" id="systemName" name="systemName" required />
    </div>
    <div class="form-group">
      <label for="localnode">Localnode:</label>
      <select id="localnode" name="localnode">${options}</select>
    </div>
    <div id="localNodeSlots" class="form-group"></div>
    <button type="button" class="accordion" id="accordionToggle" aria-expanded="false" aria-controls="accordionContent">
      Nodes
      <span class="plus-icon" id="addNodeBtn">+</span>
    </button>
    <div id="accordionContent" class="accordion-content" role="region" aria-labelledby="accordionToggle">
    <div id="nodeContainer"></div>
    </div>
    <div class="form-group">
    <label></label>
    <button class="save-button" type="submit">Save</button>
    </div>
  `);

  return form;
}

// Setup accordion functionality
function setupAccordion() {
  const accordionButton = document.getElementById('accordionToggle');
  const addNodeBtn = document.getElementById('addNodeBtn');
  const accordionContent = document.getElementById('accordionContent');

  accordionButton.addEventListener('click', (e) => {
    if (e.target.id === 'addNodeBtn') return;
    const isOpen = accordionContent.classList.toggle('show');
    accordionButton.setAttribute('aria-expanded', isOpen);
  });

  addNodeBtn.addEventListener('click', () => {
    accordionContent.classList.add('show');
    accordionButton.setAttribute('aria-expanded', true);
    addNode();
  });
}

// Add a new node dynamically
function addNode() {
  const nodeContainer = document.getElementById('nodeContainer');
  const availableNodes = getAvailableNodeOptions();

  if (availableNodes.length === 0) return;

  const selectedNode = availableNodes[0];
  usedNodeIds.add(selectedNode);

  const nodeId = `node_${nodeCount++}`;
  const nodeRow = createElement('div', { class: 'node-subgroup', id: nodeId });

  const label = createElement('label', { for: `${nodeId}_model` }, `
    node[ <select class="node-number" name="${nodeId}_number" data-number="${selectedNode}"></select> ]
  `);

  const numberSelect = label.querySelector('select');
  numberSelect.innerHTML = getAvailableNodeOptions().map(n => `<option value="${n}">${n}</option>`).join('');
  numberSelect.value = selectedNode;

  const nodeModel = createElement('select', { name: `${nodeId}_model` });
  Object.keys(state.supportedModels).forEach(model => {
    const option = createElement('option', { value: model }, model);
    nodeModel.appendChild(option);
  });

  const nodeslots = createElement('div', { class: 'node-subgroup', id: `${nodeId}_slots` });
  nodeModel.addEventListener('change', () => renderNodeSlots(`${nodeId}_slots`, nodeModel.value));

  const deleteIcon = createElement('span', { class: 'codicon codicon-trash delete-icon', title: 'Delete Node' }); // Unicode for trashcan
  deleteIcon.addEventListener('click', () => {
    usedNodeIds.delete(selectedNode);
    nodeRow.remove();
    nodeslots.remove();
    updateAllNodeDropdowns();
  });

  nodeRow.append(label, nodeModel, deleteIcon);
  nodeContainer.appendChild(nodeRow);
  nodeContainer.appendChild(nodeslots);

  updateAllNodeDropdowns();
}

// Update all node dropdowns dynamically
function updateAllNodeDropdowns() {
  document.querySelectorAll('.node-number').forEach(select => {
    const currentVal = parseInt(select.getAttribute('data-number'));
    const options = getAvailableNodeOptions();
    if (!options.includes(currentVal)) options.push(currentVal);
    options.sort((a, b) => a - b);
    select.innerHTML = options.map(n => `<option value="${n}">${n}</option>`).join('');
    select.value = currentVal;
  });
}

// Get available node options
function getAvailableNodeOptions() {
  const maxNodes = 63; // Updated maximum nodes to 64
  return Array.from({ length: maxNodes }, (_, i) => i + 1).filter(n => !usedNodeIds.has(n));
}

// Setup form submission
function setupFormSubmission() {
  const form = document.getElementById('dynamicForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = {};
    formData.forEach((value, key) => {
      data[key] = value;
    });
    const slots = []
    const nodeData = []
    console.log(data);
    const payload = {
      name: data["systemName"],
      isActive: false,
      localNode: data["localnode"],
      slots: slots.length > 0 ? slots : undefined,
      nodes: nodeData.length > 0 ? nodeData : undefined
    };
    vscode.postMessage({
      command: "add",
      data: payload
    });

  });
}