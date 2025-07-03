// @ts-check

// Script run within the webview itself.
(function () {
    // Get access to the VS Code API from within the webview context
    const vscode = acquireVsCodeApi();

    // Reference to the current state
    let currentState = {
        databasePath: '',
        encryptionKey: '',
        selectedTable: null,
        activeTab: 'schema'
    };

    // DOM elements
    const connectBtn = document.getElementById('connect-btn');
    const encryptionKeyInput = document.getElementById('encryption-key');
    const tablesListElement = document.getElementById('tables-list');
    const executeQueryBtn = document.getElementById('execute-query');
    const sqlQueryTextarea = document.getElementById('sql-query');
    
    // Tab elements
    const tabs = document.querySelectorAll('.tab');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const schemaContent = document.getElementById('schema-content');
    const queryResults = document.getElementById('query-results');
    const dataContent = document.getElementById('data-content');

    // Initialize event listeners
    function init() {
        // Connect button
        connectBtn?.addEventListener('click', handleConnect);

        // Execute query button
        executeQueryBtn?.addEventListener('click', handleExecuteQuery);

        // Tab switching
        tabs.forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    handleUpdate(message);
                    break;
                case 'databaseInfo':
                    handleDatabaseInfo(message);
                    break;
                case 'queryResult':
                    handleQueryResult(message);
                    break;
                case 'tableData':
                    handleTableData(message);
                    break;
                case 'error':
                    showError(message.message);
                    break;
            }
        });

        // Request initial database info
        requestDatabaseInfo();
    }

    function handleUpdate(message) {
        currentState.databasePath = message.databasePath;
        vscode.setState(currentState);
    }

    function handleConnect() {
        if (!connectBtn) return;
        
        connectBtn.textContent = 'Connecting...';
        connectBtn.disabled = true;
        
        currentState.encryptionKey = encryptionKeyInput?.value || '';
        vscode.setState(currentState);
        
        requestDatabaseInfo();
    }

    function requestDatabaseInfo() {
        vscode.postMessage({
            type: 'requestDatabaseInfo',
            key: currentState.encryptionKey
        });
    }

    function handleDatabaseInfo(message) {
        if (connectBtn) {
            connectBtn.textContent = 'Connect';
            connectBtn.disabled = false;
        }

        if (message.success) {
            displayTables(message.tables);
        } else {
            showError('Failed to connect to database');
        }
    }

    function displayTables(tables) {
        if (!tablesListElement) return;

        if (tables.length === 0) {
            tablesListElement.innerHTML = '<div class="info">No tables found in database</div>';
            return;
        }

        const tablesList = tables.map(table => 
            `<div class="table-item" data-table="${table.name}" onclick="selectTable('${table.name}')">
                ${table.name} (${table.type})
            </div>`
        ).join('');

        tablesListElement.innerHTML = tablesList;
    }

    function selectTable(tableName) {
        // Remove previous selection
        document.querySelectorAll('.table-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Add selection to clicked item
        const selectedItem = document.querySelector(`[data-table="${tableName}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        currentState.selectedTable = tableName;
        vscode.setState(currentState);

        // Load table schema and data
        loadTableSchema(tableName);
        loadTableData(tableName);
    }

    function loadTableSchema(tableName) {
        // Request table schema
        vscode.postMessage({
            type: 'executeQuery',
            query: `PRAGMA table_info("${tableName}")`,
            key: currentState.encryptionKey
        });
    }

    function loadTableData(tableName) {
        // Request table data
        vscode.postMessage({
            type: 'requestTableData',
            tableName: tableName,
            key: currentState.encryptionKey
        });
    }

    function handleExecuteQuery() {
        if (!sqlQueryTextarea) return;

        const query = sqlQueryTextarea.value.trim();
        if (!query) {
            showError('Please enter a SQL query');
            return;
        }

        if (executeQueryBtn) {
            executeQueryBtn.textContent = 'Executing...';
            executeQueryBtn.disabled = true;
        }

        vscode.postMessage({
            type: 'executeQuery',
            query: query,
            key: currentState.encryptionKey
        });
    }

    function handleQueryResult(message) {
        if (executeQueryBtn) {
            executeQueryBtn.textContent = 'Execute Query';
            executeQueryBtn.disabled = false;
        }

        if (message.success) {
            displayQueryResults(message.data, message.columns);
            
            // If this was a table info query, show it in schema tab
            if (message.columns.includes('name') && message.columns.includes('type')) {
                displayTableSchema(message.data, message.columns);
            }
        } else {
            showError('Query execution failed');
        }
    }

    function handleTableData(message) {
        if (message.success) {
            displayTableData(message.data, message.columns, message.tableName);
        } else {
            showError(`Failed to load data for table: ${message.tableName}`);
        }
    }

    function displayQueryResults(data, columns) {
        if (!queryResults) return;

        if (!data || data.length === 0) {
            queryResults.innerHTML = '<div class="info">Query returned no results</div>';
            return;
        }

        const table = createDataTable(data, columns);
        queryResults.innerHTML = `
            <div class="table-stats">
                <div class="stat">
                    <div class="stat-label">Rows</div>
                    <div class="stat-value">${data.length}</div>
                </div>
                <div class="stat">
                    <div class="stat-label">Columns</div>
                    <div class="stat-value">${columns.length}</div>
                </div>
            </div>
            <div class="table-container">${table}</div>
        `;
    }

    function displayTableSchema(data, columns) {
        if (!schemaContent) return;

        const schemaTable = createDataTable(data, columns);
        schemaContent.innerHTML = `
            <h4>Table Structure</h4>
            <div class="table-container">${schemaTable}</div>
        `;
    }

    function displayTableData(data, columns, tableName) {
        if (!dataContent) return;

        if (!data || data.length === 0) {
            dataContent.innerHTML = `<div class="info">Table "${tableName}" is empty</div>`;
            return;
        }

        const table = createDataTable(data, columns);
        dataContent.innerHTML = `
            <div class="table-stats">
                <div class="stat">
                    <div class="stat-label">Table</div>
                    <div class="stat-value">${tableName}</div>
                </div>
                <div class="stat">
                    <div class="stat-label">Rows</div>
                    <div class="stat-value">${data.length}</div>
                </div>
                <div class="stat">
                    <div class="stat-label">Columns</div>
                    <div class="stat-value">${columns.length}</div>
                </div>
            </div>
            <div class="table-container">${table}</div>
        `;
    }

    function createDataTable(data, columns) {
        if (!data || !columns) return '';

        const headerRow = columns.map(col => `<th>${escapeHtml(col)}</th>`).join('');
        const dataRows = data.map(row => 
            `<tr>${row.map(cell => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>`
        ).join('');

        return `
            <table class="data-table">
                <thead>
                    <tr>${headerRow}</tr>
                </thead>
                <tbody>
                    ${dataRows}
                </tbody>
            </table>
        `;
    }

    function switchTab(tabName) {
        currentState.activeTab = tabName;
        vscode.setState(currentState);

        // Update tab appearance
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update panel visibility
        tabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-tab`);
        });
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.textContent = message;
        
        // Show error in the current tab
        const activePanel = document.querySelector('.tab-panel.active');
        if (activePanel) {
            activePanel.insertBefore(errorDiv, activePanel.firstChild);
            
            // Remove error after 5 seconds
            setTimeout(() => {
                if (errorDiv.parentNode) {
                    errorDiv.parentNode.removeChild(errorDiv);
                }
            }, 5000);
        }
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    // Make selectTable available globally for onclick handlers
    window.selectTable = selectTable;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
