// Get access to the VS Code API from within the webview context
const vscode = acquireVsCodeApi();

// Wait for the webview DOM to load before referencing any HTML elements or toolkit components
window.addEventListener("load", main);

// Main function that gets executed once the webview DOM loads
function main() {
  // Pass a message back to the extension context
  vscode.postMessage({
    command: "getInitialSystems"
  });

  setVSCodeMessageListener();
}

// Set up an event listener to listen for messages passed from the extension context
function setVSCodeMessageListener() {
  const systemsContainer = document.getElementById('systems-container');
  window.addEventListener("message", (event) => {
    const command = event.data.command;
    switch (command) {
      case "systems":
        handleSystemsMessage(event.data.payload, systemsContainer);
        break;
      case "supportedModels":
        handleSupportedModelsMessage(event.data.payload, systemsContainer);
        break;
    }
  });
}

function handleSystemsMessage(payload, systemsContainer) {
  const data = JSON.parse(payload);
  const systems = data.systemInfo;
  const supportedModels = data.supportedModels;
  systemsContainer.innerHTML = ''; // Clear existing content

  if (systems.length > 0) {
    populateUI(systems, supportedModels, systemsContainer);
  }
}

function handleSupportedModelsMessage(payload, systemsContainer) {
  const models = JSON.parse(payload);
  const form = document.createElement('div');
  systemsContainer.innerHTML = '';

  // System name
  const nameGroup = createFormGroup('System Name: ', 'Enter System Name');
  form.appendChild(nameGroup);

  // Local node dropdown
  const localNodeGroup = createFormGroup('Local Node: ', '', models);
  form.appendChild(localNodeGroup);

  const localNodeSelect = localNodeGroup.querySelector('select');
  localNodeSelect.addEventListener('change', () => handleLocalNodeChange(localNodeSelect, models, localNodeGroup));

  // Nodes area
  const nodesContainer = getNodeControls(models);
  form.appendChild(nodesContainer);

  // Save button
  const saveButton = createButton('Save', 'vscode-button');
  saveButton.addEventListener('click', () => handleSaveButtonClick(nameGroup, localNodeSelect, nodesContainer));
  form.appendChild(saveButton);

  systemsContainer.appendChild(form);
}

function handleLocalNodeChange(localNodeSelect, models, localNodeGroup) {
  const selectedKey = localNodeSelect.value;
  const existingSlots = document.getElementById('slotsContainer');
  if (existingSlots) existingSlots.remove();

  if (selectedKey && models[selectedKey] && models[selectedKey].noOfSlots) {
    const slotContainer = document.createElement('div');
    slotContainer.id = "slotsContainer";
    const slotsLabel = document.createElement('h4');
    slotsLabel.textContent = `${selectedKey} Slots`;
    slotContainer.appendChild(slotsLabel);
    for (let i = 1; i <= models[selectedKey].noOfSlots; i++) {
      const slotRow = document.createElement('div');
      slotRow.className = "slot-container";
      slotRow.appendChild(createLabel(`slot[${i}]`, ''));
      if (models[selectedKey].moduleOptions) {
        const slotSelect = document.createElement('select');
        models[selectedKey].moduleOptions.forEach(module => {
          const option = document.createElement('option');
          option.value = module;
          option.textContent = module;
          slotSelect.appendChild(option);
        });
        slotRow.appendChild(slotSelect);
      }
      slotContainer.appendChild(slotRow);
    }
    localNodeGroup.insertAdjacentElement('afterend', slotContainer);
  }
}

function handleSaveButtonClick(nameGroup, localNodeSelect, nodesContainer) {
  // Validate inputs
  const systemNameInput = nameGroup.querySelector('input');
  const existingError = nameGroup.querySelector('.nameError');
  if (existingError) existingError.remove();
  systemNameInput.classList.remove('error-border');

  if (!systemNameInput.value.trim()) {
    systemNameInput.classList.add('error-border');
    const errorMessage = document.createElement('span');
    errorMessage.className = 'nameError';
    errorMessage.style.color = 'red';
    errorMessage.textContent = 'System Name is required.';
    nameGroup.appendChild(errorMessage);
    return;
  }

  const nodeData = [];
  nodesContainer.querySelectorAll('div.nodeRow').forEach(nodeRow => {
    const rowID = nodeRow.dataset.rowid;
    const nodeId = `node[${nodeRow.querySelector('select#nodeNumber').value}]`;
    const mainframe = nodeRow.querySelector('#nodeModelName').value;
    const slots = [];

    const slotContainers = document.querySelectorAll(`#nodeSlotsContainer${rowID} .slot-container`);
    slotContainers.forEach(slotContainer => {
      const slotId = slotContainer.querySelector('label').textContent;
      const module = slotContainer.querySelector('select').value;
      slots.push({ slotId, module });
    });

    const nodeObj = { nodeId, mainframe };
    if (slots.length > 0) {
      nodeObj.slots = slots;
    }
    nodeData.push(nodeObj);
  });

  const slots = [];
  const slotContainers = document.querySelectorAll('#slotsContainer .slot-container');
  slotContainers.forEach(slotContainer => {
    const slotId = slotContainer.querySelector('label').textContent;
    const module = slotContainer.querySelector('select').value;
    slots.push({ slotId, module });
  });

  const payload = {
    name: nameGroup.querySelector('input').value,
    isActive: false,
    localNode: localNodeSelect.value,
    slots: slots.length > 0 ? slots : undefined,
    nodes: nodeData.length > 0 ? nodeData : undefined
  };

  vscode.postMessage({
    command: "add",
    data: payload
  });
}


function getNodeControls(models, existingNodes = []) {
  const nodesLabelContainer = document.createElement('div');
  nodesLabelContainer.id = "nodesControls";

  const nodesLabel = document.createElement('h4');
  nodesLabel.textContent = 'Nodes';
  nodesLabelContainer.appendChild(nodesLabel);

  const plusButton = createButton('+', '.round-vscode-button');
  nodesLabelContainer.appendChild(plusButton);
  nodesLabelContainer.appendChild(createPlusButton(plusButton, models));

  const nodesContainer = document.createElement('div');
  // Render existing nodes
  existingNodes.forEach((node, index) => {
    const nodeRow = createNodeRow(index + 1, models, parseInt(node.nodeId.match(/\d+/)[0], 10), node.mainframe, node.slots);
    nodesContainer.appendChild(nodeRow);
  });

  nodesLabelContainer.appendChild(nodesContainer);
  return nodesLabelContainer;
}

function createPlusButton(button, models) {
  const nodesContainer = document.createElement('div');
  let rowID = 0;
  button.addEventListener('click', () => {
    rowID += 1;
    const nodeRow = createNodeRow(rowID, models);
    nodesContainer.appendChild(nodeRow);
  });

  return nodesContainer;
}

function createNodeRow(rowID, models, nodeId = null, mainframe = null, slots = []) {
  const nodeRow = document.createElement('div');
  nodeRow.classList.add('nodeRow');
  nodeRow.dataset.rowid = rowID;
  nodeRow.appendChild(createLabel('node[', ''));
  const nodeIdSelect = createNodeIdSelect(nodeId);
  nodeRow.appendChild(nodeIdSelect);
  nodeRow.appendChild(document.createTextNode(']'));

  const modelSelect = createModuleSelect(Object.keys(models), mainframe);
  onModuleSelectionChange(modelSelect, rowID, models, nodeRow, slots);
  nodeRow.appendChild(modelSelect);

  nodeRow.appendChild(createRemoveButton(nodeRow));
  return nodeRow;
}

function createNodeIdSelect(selectedValue = null) {
  const nodeSelect = createDropdown('', 'vscode-dropdown');
  nodeSelect.id = "nodeNumber";
  for (let i = 1; i <= 63; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    if (selectedValue && selectedValue === i) {
      opt.selected = true;
    }
    nodeSelect.appendChild(opt);
  }
  return nodeSelect;
}

function createModuleSelect(modelOptions, selectedValue = null) {
  const modelSelect = createDropdown('', 'vscode-dropdown');
  modelSelect.id = "nodeModelName";
  modelOptions.forEach(key => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    if (selectedValue && selectedValue === key) {
      option.selected = true;
    }
    modelSelect.appendChild(option);
  });

  return modelSelect;
}

function onModuleSelectionChange(modelSelect, rowID, models, nodeRow, existingSlots = []) {
  modelSelect.addEventListener('change', () => {
    renderSlots(modelSelect.value, rowID, models, nodeRow, existingSlots);
  });
}

function renderSlots(selectedKey, rowID, models, nodeRow, existingSlots = []){
  const existingSlotsContainer = document.getElementById(`nodeSlotsContainer${rowID}`);
  if (existingSlotsContainer) existingSlotsContainer.remove();

  if (selectedKey && models[selectedKey] && models[selectedKey].noOfSlots) {
    const slotContainer = document.createElement('div');
    slotContainer.id = `nodeSlotsContainer${rowID}`;
    slotContainer.className = "node-slots-container";
    const slotsLabel = createLabel("slots", '');
    slotsLabel.textContent = `${selectedKey} Slots`;
    slotContainer.appendChild(slotsLabel);
    for (let i = 1; i <= models[selectedKey].noOfSlots; i++) {
      const slot = existingSlots.find(slot => slot.slotId === `slot[${i}]`);
      const slotRow = addSlot(i, models[selectedKey].moduleOptions, slot ? slot.module : null);
      slotContainer.appendChild(slotRow);
    }
    nodeRow.insertAdjacentElement('afterend', slotContainer);
  }
};

function addSlot(slotId, moduleOptions, selectedModule = null) {
  const slotRow = document.createElement('div');
  slotRow.className = 'slot-container';
  slotRow.appendChild(createLabel(`slot[${slotId}]`, ''));

  const slotSelect = document.createElement('select');
  moduleOptions.forEach(module => {
    const option = document.createElement('option');
    option.value = module;
    option.textContent = module;
    if (selectedModule && selectedModule === module) {
      option.selected = true;
    }
    slotSelect.appendChild(option);
  });
  slotRow.appendChild(slotSelect);

  return slotRow;
}

function createRemoveButton(nodeRow) {
  const removeButton = createButton('x', '.round-vscode-button');
  removeButton.addEventListener('click', () => {
    const existingSlots = document.getElementById(`nodeSlotsContainer${nodeRow.dataset.rowid}`);
    if (existingSlots) existingSlots.remove();
    nodeRow.remove();
  });
  return removeButton;
}

function populateUI(systems, supportedModels, systemsContainer) {
  const systemDiv = document.createElement('div');
  systemDiv.className = 'system';

  const systemsDropDownLabel = createLabel('System Name:', 'vscode-input-label');
  const systemsDropDown = createDropdown('System Name', 'vscode-dropdown');



  systemDiv.appendChild(systemsDropDownLabel);
  systemDiv.appendChild(systemsDropDown);

  // Remove button with icon
  const removeButton = createButton('', 'icon-button');
  const removeIcon = document.createElement('span');
  removeIcon.className = 'codicon codicon-trash';
  removeButton.appendChild(removeIcon);
  removeButton.addEventListener('click', () => {
    vscode.postMessage({ 
      command: 'remove', 
      data: systemsDropDown.value 
    });
  });
  systemDiv.appendChild(removeButton);

  // Activate button with icon
  const activateButton = createButton('', 'icon-button');
  const activateIcon = document.createElement('span');
  activateIcon.className = 'codicon codicon-check';
  activateButton.appendChild(activateIcon);
  activateButton.addEventListener('click', () => {
    vscode.postMessage({ 
      command: 'activate', 
      data: systemsDropDown.value 
    });
  });
  systemDiv.appendChild(activateButton);

  systems.forEach(system => {
    const option = document.createElement('option');
    option.value = system.name;
    option.textContent = system.name;
    systemsDropDown.appendChild(option);
  });

  systemsContainer.appendChild(systemDiv);

  const localNodeDiv = document.createElement('div');
  const localNodeLabel = createLabel('Local Node:', 'vscode-input-label');
  const localNodeInput = createInput('text', 'vscode-input', true);

  localNodeDiv.appendChild(localNodeLabel);
  localNodeDiv.appendChild(localNodeInput);
  systemDiv.appendChild(localNodeDiv);

  systemsDropDown.addEventListener('change', () => {
    // Remove previously added controls
    const existingControls = document.getElementById('nodesControls');
    if (existingControls) {
      existingControls.remove();
    }

    const selectedSystem = systems.find(system => system.name === systemsDropDown.value);
    localNodeInput.value = selectedSystem ? selectedSystem.localNode : '';
    // Remove previously rendered slots if any
    const existingSlotsContainer = document.getElementById('nodeSlotsContainer');
    if (existingSlotsContainer) {
      existingSlotsContainer.remove();
    }

    if (selectedSystem && selectedSystem.slots) {
      renderSlots(localNodeInput.value, "", supportedModels, localNodeInput, selectedSystem.slots);
    }

    if (selectedSystem && selectedSystem.nodes) {
      const controls = getNodeControls(supportedModels, selectedSystem.nodes);
      systemsContainer.appendChild(controls);
    }

    // fire `change` to render slots
    const modelDropDowns = document.querySelectorAll('#nodeModelName');
    modelDropDowns.forEach(dropDown => {
      dropDown.dispatchEvent(new Event('change'));
    });
    });

    // trigger the default selection
    if (systems.length > 0) {
    systemsDropDown.value = systems[0].name;
    systemsDropDown.dispatchEvent(new Event('change'));
    }

  

}


function createLabel(text, className) {
  const label = document.createElement('label');
  label.textContent = text;
  label.className = className;
  return label;
}

function createDropdown(placeholder, className) {
  const dropdown = document.createElement('select');
  dropdown.placeholder = placeholder;
  dropdown.className = className;
  return dropdown;
}

function createInput(type, className, readOnly = false) {
  const input = document.createElement('input');
  input.type = type;
  input.readOnly = readOnly;
  input.className = className;
  return input;
}

function createCollapsible(summaryText, className) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = summaryText;
  details.appendChild(summary);
  details.className = className;
  return details;
}

function createButton(text, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.className = className;
  return button;
}

function createFormGroup(labelText, placeholder, options = null) {
  const group = document.createElement('div');
  group.className = 'form-group';
  const label = document.createElement('label');
  label.textContent = labelText;
  group.appendChild(label);

  if (options) {
    const select = document.createElement('select');
    Object.keys(options).forEach(key => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = key;
      select.appendChild(option);
    });
    group.appendChild(select);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    group.appendChild(input);
  }

  return group;
}