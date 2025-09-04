// Get access to the VS Code API from within the webview context
const vscode = acquireVsCodeApi();

let nodeCount = 0;

function resetNodeCounts() {
  nodeCount = 0;
}

// Wait for the webview DOM to load before referencing any HTML elements or toolkit components
window.addEventListener("load", main);

const state = {
  systemInfo: {},
  supportedModels: {},
  selectedSystemName: "",
  isEditMode: false

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
  const slotGrid = createElement('div', { class: 'grid-layout' });

  for (let i = 1; i <= noOfSlots; i++) {
    const slotContainer = createElement('div', { class: 'form-group' });
    const label = createElement('label', { for: `${id}_slot[${i}]` }, `slot [ ${i} ]`);
    const select = createElement('select', { 
      id: `${id}_slot[${i}]`, 
      name: `${id}_slot[${i}]`, 
      'aria-label': `select_${id}_slot[${i}]`
    });

    options.forEach(option => {
      const optionElement = createElement('option', { value: option }, option);
      select.appendChild(optionElement);
    });

    slotContainer.appendChild(label);
    slotContainer.appendChild(select);
    slotGrid.appendChild(slotContainer);
  }

  return slotGrid;
}

// Main function that gets executed once the webview DOM loads
function main() {
  vscode.postMessage({ command: "getInitialSystems" });
  setVSCodeMessageListener();
  setupEventDelegation();
}

// Set up an event listener to listen for messages passed from the extension context
function setVSCodeMessageListener() {
  window.addEventListener("message", (event) => {
    const { command, payload } = event.data;
    if (command === "openWorkspaceNotFound") {
      renderWorkspaceNotFound()
    }
    else if (command === "systems") {
      resetNodeCounts()
      state.isEditMode = true
      renderSavedSystems(payload);
    } else if (command === "supportedModels") {
      resetNodeCounts()
      state.isEditMode = false
      addNewSystem(payload);
    } else if (command === "systemUpdated") {
      state.isEditMode = true
      const data = JSON.parse(payload);
      state.systemInfo = data.systemInfo;
    }
  });
}

function renderWorkspaceNotFound() {
  const systemsContainer = document.getElementById('systems-container');
  systemsContainer.innerHTML = `
    <div class="empty-state">
      <p>You have not yet opened a folder.</p>
      <button id="openFolderBtn" class="vscode-style-button">Open Folder</button>
    </div>
  `;

  // Add an event listener to the button to send a message to the extension
  const openFolderButton = document.getElementById('openFolderBtn');
  openFolderButton.addEventListener('click', () => {
    vscode.postMessage({ command: 'openFolder' });
  });
}

// Handle systems message and populate the UI
function renderSavedSystems(payload) {
  const data = JSON.parse(payload);
  const { systemInfo, supportedModels, selectedSystem } = data;
  state.supportedModels = supportedModels;
  state.systemInfo = systemInfo;
  state.selectedSystemName = selectedSystem;
  const systemsContainer = document.getElementById('systems-container');

  if (state.systemInfo.length === 0) {
    systemsContainer.innerHTML = `
      <div class="empty-state">
      <p>No system configurations found. You can:</p>
      <ul>
        <li>
        Click the <strong><span class="icon codicon codicon-add"></span></strong> icon to manually add a new system configuration.
        </li>
        <li>
        Click the <strong><span class="icon codicon codicon-type-hierarchy-sub"></span></strong> icon to automatically retrieve system configurations for a connected instrument.
        </li>
      </ul>
      </div>
    `;
    return;
  }

  const selectSystem = createElement('div', { class: "form-group" }, `
        <label for="systemSelector">Selected System</label>
  `);

  // Create a dropdown for selecting system names
  const dropdown = createElement('select', { id: 'systemSelector', 'data-event': 'system-selector' , 'aria-label': 'select_system'});

  systemInfo.forEach(system => {
    const option = createElement('option', { value: system.name }, system.name);
    dropdown.appendChild(option);
  });

  const deleteIcon = createElement('span', { 
    class: 'codicon codicon-trash delete-icon', 
    'data-event': 'delete-selected-system',
    title: 'Delete Selected System',
    'aria-label': 'delete_selected_system',
    role: 'button',
    tabindex: '0'
  });

  const selectWithIcon = createElement('div', { class: 'select-with-icon' });
  selectWithIcon.appendChild(dropdown);
  selectWithIcon.appendChild(deleteIcon);

  selectSystem.append(selectWithIcon);


  // Create the form with pre-filled data
  const form = createAddSystemForm(state.supportedModels);

  // Clear and populate the container with the updated form
  clearAndPopulate(systemsContainer, selectSystem);
  systemsContainer.appendChild(form);


  // Render the form with the initially selected system data
  if (state.selectedSystemName) {
    const initialSystem = systemInfo.find(system => system.name === state.selectedSystemName);
    if (initialSystem) {
      dropdown.value = initialSystem.name
      renderFormWithData(form, initialSystem);
    }
  }
}

function renderFormWithData(form, systemData) {
  const systemNameInput = form.querySelector('#systemName');
  systemNameInput.value = systemData.name;
  systemNameInput.readOnly = true;

  const localNodeSelect = form.querySelector('#localnode');
  localNodeSelect.value = systemData.localNode;

  // Render slots if available
  const localNodeSlots = form.querySelector('#localNodeSlots');
  localNodeSlots.innerHTML = ""
  if (systemData.slots) {
    clearAndPopulate(localNodeSlots, renderSlots(systemData.slots.length, state.supportedModels[systemData.localNode].moduleOptions, 'localNodeSlots'));
    systemData.slots.forEach((slot, index) => {
      const slotElement = localNodeSlots.querySelector(`#localNodeSlots_slot\\[${index + 1}\\]`);
      if (slotElement) {
        slotElement.value = slot.module;
      }
    });
  }


  // Render nodes if available
  const nodeContainer = form.querySelector('#nodeContainer');
  nodeContainer.innerHTML = ""
  nodeContainer.classList.remove('show')
  if (systemData.nodes) {
    systemData.nodes.forEach(node => {
      addNode();
      const nodeRow = nodeContainer.lastChild.previousSibling; // Get the last added node row
      const numberSelect = nodeRow.querySelector('.node-number');
      const modelSelect = nodeRow.querySelector('select[name$="_mainframe"]');
      if (numberSelect) numberSelect.value = parseInt(node.nodeId.match(/\d+/)?.[0] || "", 10);
      if (modelSelect) modelSelect.value = node.mainframe;

      // Render slots for the node if available
      if (node.slots) {
        const nodeSlotsContainer = nodeRow.nextSibling; // Slots container is next to the node row
        clearAndPopulate(nodeSlotsContainer, renderSlots(node.slots.length, state.supportedModels[node.mainframe].moduleOptions, `${nodeRow.id}_slots`));
        node.slots.forEach((slot, index) => {
          const slotElement = nodeSlotsContainer.querySelector(`#${nodeRow.id}_slots_slot\\[${index + 1}\\]`);
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
  state.systemInfo = data.systemInfo;
  state.selectedSystemName = "";
  const systemsContainer = document.getElementById('systems-container');
  const form = createAddSystemForm(state.supportedModels);

  const saveButton = createElement('div', { class: "form-group" }, `
    <label></label>
    <button class="vscode-style-button" data-id="save" type="submit">Save</button>`);
  form.appendChild(saveButton);
  clearAndPopulate(systemsContainer, form);
}

// Create the add system form
function createAddSystemForm(supportedModels) {
  const options = Object.keys(supportedModels)
    .map(model => `<option value="${model}">${model}</option>`)
    .join('');

  const form = createElement('form', { id: 'dynamicForm', novalidate: '' }, `
    
      <div class="form-group">
        <label for="systemName" >System Name</label>
        <input type="text" id="systemName" name="systemName" aria-label= "system_name_input" placeholder = "Enter System Name" required />
      </div>
      <div class="form-group">
        <label for="localnode">localnode</label>
        <select id="localnode" aria-label= "select_localnode" name="localnode">${options}</select>
      </div>
    
    <div id="localNodeSlots"></div>
    <div class="accordion-header-region">
      <button type="button" class="accordion" id="accordionToggle" aria-expanded="false" aria-controls="accordionContent">
        <span class="accordion-left">
          <span class="chevron codicon codicon-chevron-right"></span>
          <span>Nodes</span>
        </span>
        <span class="plus-icon" id="addNodeBtn" title="Add TSP-Link Node" aria-label="add_node" role="button" tabindex= "0">+</span>
      </button>
      <div id="accordionContent" class="accordion-content" role="region" aria-labelledby="accordionToggle">
        <div id="nodeContainer"></div>
      </div>
      </div>
  `);

  return form;
}


// Add a new node dynamically
function addNode() {
  const nodeContainer = document.getElementById('nodeContainer');

  const nodeId = `node_${nodeCount++}`;
  const nodeRow = createElement('div', { class: 'node-subgroup', id: nodeId });

  // Instead of putting select inside label as HTML string:
  const label = createElement('label', { for: `${nodeId}_nodeId`, class: 'node-label' }, 'node [');
  const numberSelect = createElement('select', {
    class: 'node-number',
    name: `${nodeId}_nodeId`,
    id: `${nodeId}_nodeId`,
    'aria-label': `select_nodeId_${nodeId}`
  });
  label.appendChild(numberSelect);
  label.appendChild(document.createTextNode(']'));

  numberSelect.innerHTML = getAvailableNodeOptions().map(n => `<option value="${n}">${n}</option>`).join('');
  numberSelect.value = 1;

  // Create label for node model select
  const nodeModelLabel = createElement('label',{}, 'Model');
  const nodeModel = createElement('select', { 
    name: `${nodeId}_mainframe`, 
    id: `${nodeId}_mainframe`,
    'aria-label': `select_${nodeId}_model` 
  });
  Object.keys(state.supportedModels).forEach(model => {
    const option = createElement('option', { value: model }, model);
    nodeModel.appendChild(option);
  });

  // Create a custom control wrapper for nodeModel and deleteIcon
  const deleteIcon = createElement('span', { 
    class: 'codicon codicon-trash delete-icon', 
    'data-event': 'delete-node', 
    title: 'Delete Node',
    'aria-label': `delete_selected_node_${nodeId}`,
    role: 'button',
    tabindex: '0'
  });
  const selectWithIcon = createElement('div', { class: 'select-with-icon' });
  selectWithIcon.appendChild(nodeModel);
  selectWithIcon.appendChild(deleteIcon);
  const nodeModelDiv = createElement('div', { class: 'form-group'});
  nodeModelDiv.append(nodeModelLabel, selectWithIcon)

  nodeRow.append(label, nodeModelDiv);
  nodeContainer.appendChild(nodeRow);
  const nodeslots = createElement('div', { id: `${nodeId}_slots` });
  nodeContainer.appendChild(nodeslots);

  if (!nodeContainer.classList.contains('show'))
    nodeContainer.classList.add('show');

}

function checkDuplicateNodeNumber() {
  const nodeNumbers = {};
  let hasDuplicate = false;

  document.querySelectorAll('.node-number').forEach(select => {
    // Clear previous error state
    select.classList.remove('invalid-node-number');
    select.removeAttribute('title'); // Remove any existing tooltip

    const value = select.value;
    if (nodeNumbers[value]) {
      select.classList.add("invalid-node-number");
      select.setAttribute('title', 'Duplicate node number detected!');
      if (!nodeNumbers[value].classList.contains("invalid-node-number")) {
        nodeNumbers[value].classList.add("invalid-node-number");
        nodeNumbers[value].setAttribute('title', 'Duplicate node number detected!');
      }

      hasDuplicate = true;
    } else {
      nodeNumbers[value] = select;
    }
  });

  return hasDuplicate;
}

// Get available node options
function getAvailableNodeOptions() {
  const maxNodes = 63; // Updated maximum nodes to 64
  return Array.from({ length: maxNodes }, (_, i) => i + 1);
}


function getNodes(data) {
  const nodes = [];
  const nodeMap = {};

  Object.keys(data).forEach((key) => {
    if (key.startsWith("node_")) {
      const [nodeId, property] = key.split("_").slice(1);
      if (!nodeMap[nodeId]) {
        nodeMap[nodeId] = {};
      }

      if (property === "mainframe") {
        nodeMap[nodeId].mainframe = data[key];
      } else if (property === "nodeId") {
        nodeMap[nodeId].nodeId = `node[${data[key]}]`;
      } else if (property.startsWith("slot")) {
        if (!nodeMap[nodeId].slots)
          nodeMap[nodeId].slots = []
        const slotId = key.split("_").pop();
        nodeMap[nodeId].slots.push({
          slotId: slotId,
          module: data[key]
        });
      }
    }
  });

  Object.values(nodeMap).forEach((node) => {
    nodes.push(node);
  });

  return nodes;
}

// Helper function to extract slots data
function getSlots(data) {
  const slots = [];
  Object.keys(data).forEach((key) => {
    if (key.startsWith("localNodeSlots_slot")) {
      const slotId = key.split("_").pop();
      slots.push({
        slotId: slotId,
        module: data[key]
      });
    }
  });
  return slots;
}

function setupEventDelegation() {
  const systemsContainer = document.getElementById('systems-container');

  // Add a single event listener to the parent container
  systemsContainer.addEventListener('click', (event) => {
    const target = event.target;

    // Handle delete icon click
    if (target.classList.contains('delete-icon')) {
      if (target.dataset.event === "delete-node") {
        const nodeRow = target.closest('.node-subgroup');
        if (nodeRow) {
          const nodeId = nodeRow.id;
          nodeRow.remove();
          document.getElementById(`${nodeId}_slots`)?.remove(); // Remove associated slots
        }
        checkDuplicateNodeNumber()
        handleFormUpdate()
        const nodeContainer = document.getElementById('nodeContainer');

        if (!nodeContainer.hasChildNodes())
          nodeContainer.classList.remove('show')
      }
      else if (target.dataset.event === "delete-selected-system") {
        const systemSelector = document.getElementById('systemSelector');
        const selectedSystem = systemSelector ? systemSelector.value : null;
        if (selectedSystem) {
          vscode.postMessage({
            command: "delete",
            data: selectedSystem
          });
        }
      }
    }



    // Handle add node button click
    if (target.id === 'addNodeBtn') {
      const accordionContent = document.getElementById('accordionContent');
      const accordionButton = document.getElementById('accordionToggle');

      // Expand the accordion if it's not already expanded
      if (!accordionContent.classList.contains('show')) {
        accordionContent.classList.add('show');
        accordionButton.setAttribute('aria-expanded', true);
      }

      // Add a new node
      addNode();
      checkDuplicateNodeNumber();
      handleFormUpdate();

      // Stop further event propagation to prevent toggling
      event.stopPropagation();
      return;
    }

    // Handle accordion toggle
    if (target.id === 'accordionToggle' || target.closest('#accordionToggle')) {
      const accordionContent = document.getElementById('accordionContent');
      const accordionButton = document.getElementById('accordionToggle');
      const isOpen = accordionContent.classList.toggle('show');
      accordionButton.setAttribute('aria-expanded', isOpen);
    }
  });

  systemsContainer.addEventListener('change', (event) => {
    const target = event.target;

    // Handle change event for the system selector dropdown
    if (target.tagName === 'SELECT' && target.dataset.event === 'system-selector') {
      resetNodeCounts()
      const selectedSystem = state.systemInfo.find(system => system.name === target.value);
      if (selectedSystem) {
        state.selectedSystemName = selectedSystem.name;
        const form = document.getElementById('dynamicForm');
        renderFormWithData(form, selectedSystem);
        vscode.postMessage({
          command: "activate",
          data: selectedSystem.name
        });
      }
    }

    // Handle change event for node model SELECT elements
    if (target.tagName === 'SELECT' && target.name.endsWith('_mainframe')) {
      const nodeId = target.closest('.node-subgroup').id;
      const selectedValue = target.value;
      renderNodeSlots(`${nodeId}_slots`, selectedValue);
      handleFormUpdate();
    }

    // Handle change event for slot SELECT elements
    if (target.tagName === 'SELECT' && target.name.includes('_slot')) {
      handleFormUpdate();
    }

    // Handle change event for slot SELECT elements
    if (target.tagName === 'SELECT' && target.className.includes("node-number")) {
      checkDuplicateNodeNumber()
      handleFormUpdate();
    }

    // Handle change event for local node SELECT
    if (target.id === 'localnode') {
      renderNodeSlots('localNodeSlots', target.value);
      handleFormUpdate();
    };

  });

  systemsContainer.addEventListener('submit', (event) => {
    event.preventDefault(); // Prevent form submission from reloading the page
    if (validate()) {
      const payload = getfileldData();
      // Send the updated data to the extension
      vscode.postMessage({
        command: "add",
        data: payload
      });
    }
  });
}


function handleFormUpdate() {

  if (!state.isEditMode) {
    // Do not trigger update if not in edit mode
    return;
  }

  if (validate()) {
    const payload = getfileldData()
    // Send the updated data to the extension
    vscode.postMessage({
      command: "update",
      data: payload
    });
  }
}

/**
 * Collects and processes form data from a dynamic form element to generate a payload object.
 *
 * @function
 * @returns {Object} payload - The processed payload object containing system configuration data.
 * @property {string} payload.name - The name of the system, retrieved from the form data.
 * @property {boolean} payload.isActive - Indicates whether the system is active (always true).
 * @property {string} payload.localNode - The local node identifier, retrieved from the form data.
 * @property {Array|undefined} payload.slots - An array of slot data, or undefined if no slots are provided.
 * @property {Array|undefined} payload.nodes - An array of node data, or undefined if no nodes are provided.
 */
function getfileldData() {
  const form = document.getElementById('dynamicForm');
  // Collect updated data
  const formData = new FormData(form);
  const data = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });

  const slots = getSlots(data);
  const nodeData = getNodes(data);
  const payload = {
    name: data["systemName"],
    isActive: true,
    localNode: data["localnode"],
    slots: slots.length > 0 ? slots : undefined,
    nodes: nodeData.length > 0 ? nodeData : undefined
  };

  return payload;
}

/**
 * Validates the system configuration form.
 *
 * This function checks the following:
 * - Ensures the system name field is not empty.
 * - Ensures the system name is not a duplicate of an existing system name.
 * - Checks for duplicate node numbers using the `checkDuplicateNodeNumber` function.
 *
 * If any validation fails, appropriate error messages are displayed, and the form is marked as invalid.
 *
 * @returns {boolean} `true` if the form is valid, otherwise `false`.
 */
function validate() {
  let isFormValid = true
  const nameInput = document.getElementById('systemName');

  // Validate Name Field
  if (!nameInput.value.trim()) {
    showError(nameInput, 'System name cannot be empty');
    isFormValid = false
  }

  if (state.systemInfo.some(system => system.name === nameInput.value.trim() && system.name !== state.selectedSystemName)) {
    showError(nameInput, 'Duplicate system name not allowed');
    isFormValid = false
  }

  if (checkDuplicateNodeNumber()) {
    isFormValid = false
  }
  return isFormValid
}

function showError(input, message) {
  if (!input.classList.contains('invalid')) {
    input.classList.add('invalid');
    input.setAttribute('title', message);

    // Add an event listener to clear the error when the user starts typing
    input.addEventListener('input', () => {
      clearError(input);
    }, { once: true });
  }
}

// Function to clear the error
function clearError(input) {
  // Remove the 'invalid' class and tooltip
  input.classList.remove('invalid');
  input.removeAttribute('title');
}