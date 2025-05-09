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
  selected_system: {}
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
  const slotContainer = createElement('div', { class: 'slot-group' });

  for (let i = 1; i <= noOfSlots; i++) {
    const label = createElement('label', { for: `${id}_slot[${i}]` }, `slot [ ${i} ]`);
    const select = createElement('select', { id: `${id}_slot[${i}]`, name: `${id}_slot[${i}]` });

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
  setupEventDelegation();
}

// Set up an event listener to listen for messages passed from the extension context
function setVSCodeMessageListener() {
  window.addEventListener("message", (event) => {
    const { command, payload } = event.data;
    resetNodeCounts()
    if (command === "systems") {
      renderSavedSystems(payload);
    } else if (command === "supportedModels") {
      addNewSystem(payload);
    }
  });
}

// Handle systems message and populate the UI
function renderSavedSystems(payload) {
  const data = JSON.parse(payload);
  const { systemInfo, supportedModels, selected_system } = data;
  state.supportedModels = supportedModels;
  state.systemInfo = systemInfo;
  state.selected_system = selected_system
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

  const selectSystem = createElement('div', { class: "node-subgroup" }, `
        <label for="systemSelector">Select System:</label>
  `);

  // Create a dropdown for selecting system names
  const dropdown = createElement('select', { id: 'systemSelector', 'data-event': 'system-selector' });

  systemInfo.forEach(system => {
    const option = createElement('option', { value: system.name }, system.name);
    dropdown.appendChild(option);
  });

  const deleteIcon = createElement('span', { class: 'codicon codicon-trash delete-icon', 'data-event': 'delete-selected-system', title: 'Delete Selected System' });


  selectSystem.append(dropdown);
  selectSystem.appendChild(deleteIcon);


  // Create the form with pre-filled data
  const form = createAddSystemForm(state.supportedModels);

  // Clear and populate the container with the updated form
  clearAndPopulate(systemsContainer, selectSystem);
  systemsContainer.appendChild(form);


  // Render the form with the initially selected system data
  if (selected_system) {
    const initialSystem = systemInfo.find(system => system.name === selected_system);
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
  if (systemData.slots) {
    clearAndPopulate(localNodeSlots, renderSlots(systemData.slots.length, state.supportedModels[systemData.localNode].moduleOptions, 'localNodeSlots'));
    systemData.slots.forEach((slot, index) => {
      const slotElement = localNodeSlots.querySelector(`#localNodeSlots_slot\\[${index + 1}\\]`);
      if (slotElement) {
        slotElement.value = slot.module;
      }
    });
  }
  else {
    localNodeSlots.innerHTML = ""
  }

  // Render nodes if available
  const nodeContainer = form.querySelector('#nodeContainer');
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
  else {
    nodeContainer.innerHTML = ""
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
  const form = createAddSystemForm(state.supportedModels);

  const saveButton = createElement('div', { class: "form-group" }, `
    <label></label>
    <button class="save-button" data-id="save" type="submit">Save</button>`);
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
      <label for="systemName">System Name:</label>
      <input type="text" id="systemName" name="systemName" placeholder = "Enter System Name" required />
    </div>
    <div class="form-group">
      <label for="localnode">localnode:</label>
      <select id="localnode" name="localnode">${options}</select>
    </div>
    <div id="localNodeSlots"></div>
    <button type="button" class="accordion" id="accordionToggle" aria-expanded="false" aria-controls="accordionContent">
       <span class="accordion-left">
          <span class="chevron codicon codicon-chevron-right"></span>
          <span>Nodes</span>
        </span>
      <span class="plus-icon" id="addNodeBtn">+</span>
    </button>
    <div id="accordionContent" class="accordion-content" role="region" aria-labelledby="accordionToggle">
    <div id="nodeContainer"></div>
    </div>
  `);

  return form;
}


// Add a new node dynamically
function addNode() {
  const nodeContainer = document.getElementById('nodeContainer');

  const nodeId = `node_${nodeCount++}`;
  const nodeRow = createElement('div', { class: 'node-subgroup', id: nodeId });

  const label = createElement('label', { for: `${nodeId}_mainframe` }, `
    node [ <select class="node-number" name="${nodeId}_nodeId"></select> ]
  `);

  const numberSelect = label.querySelector('select');
  numberSelect.innerHTML = getAvailableNodeOptions().map(n => `<option value="${n}">${n}</option>`).join('');
  numberSelect.value = 1;

  const nodeModel = createElement('select', { name: `${nodeId}_mainframe` });
  Object.keys(state.supportedModels).forEach(model => {
    const option = createElement('option', { value: model }, model);
    nodeModel.appendChild(option);
  });

  const nodeslots = createElement('div', { id: `${nodeId}_slots` });
  const deleteIcon = createElement('span', { class: 'codicon codicon-trash delete-icon', 'data-event': 'delete-node', title: 'Delete Node' }); // Unicode for trashcan
  nodeRow.append(label, nodeModel, deleteIcon);
  nodeContainer.appendChild(nodeRow);
  nodeContainer.appendChild(nodeslots);

}

function checkDuplicateNodeNumber() {
  const nodeNumbers = {};
  let hasDuplicate = false;

  document.querySelectorAll('.node-number').forEach(select => {
    const value = select.value;
    if (nodeNumbers[value]) {
      select.classList.add("invalid-node-number");
      if(!nodeNumbers[value].classList.contains("invalid-node-number")){
        nodeNumbers[value].classList.add("invalid-node-number");
      }
     
      hasDuplicate = true;
    } else {
      nodeNumbers[value] = select;
      select.classList.remove("invalid-node-number");
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
      accordionContent.classList.add('show');
      accordionButton.setAttribute('aria-expanded', true);
      addNode();
      checkDuplicateNodeNumber()
    }

    // Handle accordion toggle
    if (target.id === 'accordionToggle') {
      const accordionContent = document.getElementById('accordionContent');
      const isOpen = accordionContent.classList.toggle('show');
      target.setAttribute('aria-expanded', isOpen);
    }
  });

  systemsContainer.addEventListener('change', (event) => {
    const target = event.target;

    // Handle change event for the system selector dropdown
    if (target.tagName === 'SELECT' && target.dataset.event === 'system-selector') {
      resetNodeCounts()
      const selectedSystem = state.systemInfo.find(system => system.name === target.value);
      if (selectedSystem) {
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
    }

    // Handle change event for slot SELECT elements
    if (target.tagName === 'SELECT' && target.name.includes('_slot')) {
      console.log(`Slot changed: ${target.name}, New Value: ${target.value}`);
    }

    // Handle change event for slot SELECT elements
    if (target.tagName === 'SELECT' && target.className.includes("node-number")) {
      checkDuplicateNodeNumber()
    }

    // Handle change event for local node SELECT
    if (target.id === 'localnode') {
      renderNodeSlots('localNodeSlots', target.value);
    };

  });

  systemsContainer.addEventListener('submit', (event) => {
    const form = event.target;

    // Handle form submission
    if (form.id === 'dynamicForm') {
      event.preventDefault();

      // Validate Name Field
      const nameInput = document.getElementById('systemName');
      if (!nameInput.value.trim()) {
        showError(nameInput, 'Name is required.');
        return
      }

      if (checkDuplicateNodeNumber()) {
        return
      }

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
      vscode.postMessage({
        command: "add",
        data: payload
      });
    }
  });
}

// Function to show error message
function showError(input) {
  input.classList.add('invalid-node-number'); // Add error styling to the input field
}