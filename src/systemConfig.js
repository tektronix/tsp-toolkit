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
        const systems = JSON.parse(event.data.payload);
        systemsContainer.innerHTML = ''; // Clear existing content

        // Populate UI with systems
        if (systems.length > 0) {
          const addButton = createButton("Add System", 'vscode-button');
          systemsContainer.appendChild(addButton);

          // Add event listener to addButton
          addButton.addEventListener('click', () => {
            // Pass a message back to the extension context
            vscode.postMessage({
              command: "getSupportedModels"
            });
          });


          const removeButton = createButton("Remove System", 'vscode-button');
          systemsContainer.appendChild(removeButton);

          // Add event listener to removeButton
          removeButton.addEventListener('click', () => {
            const selectedSystemName = document.querySelector('.vscode-dropdown').value;
            vscode.postMessage({
              command: "remove",
              data: selectedSystemName
            });
          });

          const content = populateUI(systems);
          systemsContainer.appendChild(content);
        } else {
          const addButton = createButton("Add System", 'vscode-button');
          systemsContainer.appendChild(addButton);
          // Add event listener to addButton
          addButton.addEventListener('click', () => {
            // Pass a message back to the extension context
            vscode.postMessage({
              command: "getSupportedModels"
            });
          });
        }

        break;
      case "supportedModels":
        const models = JSON.parse(event.data.payload);
        const form = document.createElement('div');
        systemsContainer.innerHTML = '';

        // System name
        const nameGroup = document.createElement('div');
        nameGroup.className = 'form-group';
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'System Name: ';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Enter System Name';
        nameGroup.appendChild(nameLabel);
        nameGroup.appendChild(nameInput);
        form.appendChild(nameGroup);

        // Local node dropdown
        const localNodeGroup = document.createElement('div');
        localNodeGroup.className = 'form-group';
        const localNodeLabel = document.createElement('label');
        localNodeLabel.textContent = 'Local Node: ';
        const localNodeSelect = document.createElement('select');
        Object.keys(models).forEach(key => {
          const option = document.createElement('option');
          option.value = key;
          option.textContent = key;
          localNodeSelect.appendChild(option);
        });
        localNodeGroup.appendChild(localNodeLabel);
        localNodeGroup.appendChild(localNodeSelect);
        form.appendChild(localNodeGroup);

        localNodeSelect.addEventListener('change', () => {
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
              slotRow.appendChild(createLabel(`slot[${i}]:`, ''));
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
        });

        // Nodes area
        const nodesLabelContainer = document.createElement('div');
        nodesLabelContainer.style.display = 'inline-flex';
        nodesLabelContainer.style.alignItems = 'center';

        const nodesLabel = document.createElement('h4');
        nodesLabel.textContent = 'Nodes';
        nodesLabelContainer.appendChild(nodesLabel);

        const plusButton = createButton('+', '.round-vscode-button');
        nodesLabelContainer.appendChild(plusButton);
        form.appendChild(nodesLabelContainer);

        const nodesContainer = document.createElement('div');

        let rowID = 0;
        plusButton.addEventListener('click', () => {
          rowID += 1;
          const nodeRow = document.createElement('div');
          nodeRow.classList.add('nodeRow');
          nodeRow.dataset.rowid = rowID;

          nodeRow.appendChild(createLabel('node[', ''));
          const nodeSelect = createDropdown('', 'vscode-dropdown');
          nodeSelect.id = "nodeNumber";
          for (let i = 1; i <= 63; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = i;
            nodeSelect.appendChild(opt);
          }
          nodeRow.appendChild(nodeSelect);
          nodeRow.appendChild(document.createTextNode(']: '));

          const modelSelect = createDropdown('', 'vscode-dropdown');
          modelSelect.id = "nodeModelName";
          Object.keys(models).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            modelSelect.appendChild(option);
          });
          nodeRow.appendChild(modelSelect);

          modelSelect.addEventListener('change', () => {
            const selectedKey = modelSelect.value;
            const existingSlots = document.getElementById(`nodeSlotsContainer${rowID}`);
            if (existingSlots) existingSlots.remove();
            nodeRow.dataset.associateSlots = models[selectedKey]?.noOfSlots ? true : false;

            if (selectedKey && models[selectedKey] && models[selectedKey].noOfSlots) {
              const slotContainer = document.createElement('div');
              slotContainer.id = `nodeSlotsContainer${rowID}`;
              slotContainer.className = "node-slots-container";
              const slotsLabel = createLabel("slots", '');
              slotsLabel.textContent = `${selectedKey} Slots`;
              slotContainer.appendChild(slotsLabel);
              for (let i = 1; i <= models[selectedKey].noOfSlots; i++) {
                const slotRow = document.createElement('div');
                slotRow.className = 'slot-container';
                slotRow.appendChild(createLabel(`slot[${i}]:`, ''));
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
              nodeRow.insertAdjacentElement('afterend', slotContainer);
            }
          });

          const removeButton = createButton('x', '.round-vscode-button');
          removeButton.addEventListener('click', () => {
            const existingSlots = document.getElementById(`nodeSlotsContainer${nodeRow.dataset.rowid}`);
            if (existingSlots) existingSlots.remove();
            nodeRow.remove();
          });
          nodeRow.appendChild(removeButton);

          nodesContainer.appendChild(nodeRow);
        });
        form.appendChild(nodesContainer);

        // Save button
        const saveButton = createButton('Save', 'vscode-button');
        saveButton.addEventListener('click', () => {
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
            name: nameInput.value,
            isActive: true,
            localNode: localNodeSelect.value,
            slots: slots.length > 0 ? slots : undefined,
            nodes: nodeData.length > 0 ? nodeData : undefined
          };

          vscode.postMessage({
            command: "add",
            data: payload
          });
        });
        form.appendChild(saveButton);

        systemsContainer.appendChild(form);
        break;
    }
  });
}

function populateUI(systems) {
  const systemDiv = document.createElement('div');
  systemDiv.className = 'system';

  const systemsDropDownLabel = createLabel('System Name:', 'vscode-input-label');
  const systemsDropDown = createDropdown('System Name', 'vscode-dropdown');

  systemDiv.appendChild(systemsDropDownLabel);
  systemDiv.appendChild(systemsDropDown);

  systems.forEach(system => {
    const option = document.createElement('option');
    option.value = system.name;
    option.textContent = system.name;
    systemsDropDown.appendChild(option);
  });

  const localNodeLabel = createLabel('Local Node:', 'vscode-input-label');
  const localNodeInput = createInput('text', 'vscode-input', true);

  systemsDropDown.addEventListener('change', () => {
    const selectedSystem = systems.find(system => system.name === systemsDropDown.value);
    localNodeInput.value = selectedSystem ? selectedSystem.localNode : '';
    if (selectedSystem) {
      addNodes(selectedSystem.nodes);
    }
  });

  systemDiv.appendChild(localNodeLabel);
  systemDiv.appendChild(localNodeInput);
  return systemDiv;
}

function addNodes(nodes) {
  // Clear existing nodes content
  const existingNodesContainer = document.querySelector('.nodes-container');
  if (existingNodesContainer) {
    existingNodesContainer.remove();
  }

  const nodesContainer = document.createElement('div');
  nodesContainer.className = 'nodes-container';

  const nodesCollapsible = createCollapsible('Nodes', 'vscode-details');

  const nodesContent = document.createElement('div');
  nodesContent.className = 'vscode-details-content';

  nodes.forEach(node => {
    const nodeContainer = addNode(node);
    nodesContent.appendChild(nodeContainer);
  });

  nodesCollapsible.appendChild(nodesContent);
  nodesContainer.appendChild(nodesCollapsible);
  document.getElementById('systems-container').appendChild(nodesContainer);
}

function addSlots(slots) {
  const slotsContainer = document.createElement('div');
  slotsContainer.className = 'slots-container';

  const slotsCollapsible = createCollapsible('Slots', 'vscode-details');

  const slotsContent = document.createElement('div');
  slotsContent.className = 'vscode-details-content';

  slots.forEach(slot => {
    const slotContainer = addSlot(slot);
    slotsContent.appendChild(slotContainer);
  });

  slotsCollapsible.appendChild(slotsContent);
  slotsContainer.appendChild(slotsCollapsible);
  return slotsContainer;
}

function addNode(nodeDetails) {
  const nodeContainer = document.createElement('div');
  nodeContainer.className = 'node-container';

  const nodeCollapsible = createCollapsible(nodeDetails.nodeId, 'vscode-details');

  const nodeContent = document.createElement('div');
  nodeContent.className = 'vscode-details-content';

  if (nodeDetails.slots) {
    nodeContent.appendChild(addSlots(nodeDetails.slots));
  }

  nodeCollapsible.appendChild(nodeContent);
  nodeContainer.appendChild(nodeCollapsible);
  return nodeContainer;
}

function addSlot(slotDetails) {
  const slotContainer = document.createElement('div');
  slotContainer.className = 'slot-container';

  const slotCollapsible = createCollapsible(slotDetails.slotId, 'vscode-details');

  slotContainer.appendChild(slotCollapsible);
  return slotContainer;
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
