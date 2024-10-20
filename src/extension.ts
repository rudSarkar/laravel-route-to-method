import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {

    // Registering command VSCode
    const disposable = vscode.commands.registerCommand('laravelcontrollermethodfinder.findLaravelRoutesToController', () => {
        console.log("Command registered and working");

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const routesPath = path.join(rootPath, 'routes');
        const controllersPath = path.join(rootPath, 'app', 'Http', 'Controllers');

        if (!fs.existsSync(routesPath)) {
            vscode.window.showErrorMessage('Routes folder not found');
            return;
        }

        if (!fs.existsSync(controllersPath)) {
            vscode.window.showErrorMessage('Controllers folder not found');
            return;
        }

        // Get all route and controller files
        const routeFiles = getAllPhpFiles(routesPath);
        const controllerFiles = getAllPhpFiles(controllersPath);

        const routes = findLaravelRoutesToController(routeFiles, controllerFiles);
        displayRoutes(routes);
    });

    // Registering command for menu
    const goToControllerCommand = vscode.commands.registerCommand('laravelcontrollermethodfinder.goToController', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        if (!isRouteFile(editor.document.fileName)) {
            vscode.window.showErrorMessage('This command only works in Laravel route files.');
            return;
        }

        // Parse the current line to extract route info
        const lineText = editor.document.lineAt(editor.selection.active.line).text;
        const routeInfo = parseRouteLine(lineText);

        if (!routeInfo) {
            vscode.window.showErrorMessage('No route definition found on this line.');
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!workspaceFolder) {
            return;
        }

        const controllersPath = path.join(workspaceFolder, 'app', 'Http', 'Controllers');
        // Get all controller files
        const controllerFiles = getAllPhpFiles(controllersPath); // Add this line
        const controllerPath = findControllerFile(controllerFiles, routeInfo.controllerName); // Use the array

        if (controllerPath === 'Controller not found') {
            vscode.window.showErrorMessage(`Controller ${routeInfo.controllerName} not found.`);
            return;
        }

        const methodLine = await findMethodLineNumber(controllerPath, routeInfo.methodName);
        if (methodLine === -1) {
            vscode.window.showErrorMessage(`Method ${routeInfo.methodName} not found in controller.`);
            return;
        }

        // Open the controller file and navigate to the method
        const document = await vscode.workspace.openTextDocument(controllerPath);
        const editorInstance = await vscode.window.showTextDocument(document);

        const position = new vscode.Position(methodLine - 1, 0);
        editorInstance.selection = new vscode.Selection(position, position);
        editorInstance.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    });


    context.subscriptions.push(disposable, goToControllerCommand);
}

// Utility function to get all .php files from a directory recursively
function getAllPhpFiles(dirPath: string): string[] {
    let results: string[] = [];

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            // Recursively search this directory
            results = results.concat(getAllPhpFiles(filePath));
        } else if (file.endsWith('.php')) {
            // Push only .php files
            results.push(filePath);
        }
    }

    return results;
}

interface RouteInfo {
    routeName: string;
    controllerName: string;
    methodName: string;
    routeFilePath: string;
    controllerFilePath: string;
    controllerMethod: string | null;
}

// Search for a controller file in the specified directory
function findControllerFile(controllerFiles: string[], controllerName: string): string {
    const controllerFile = `${controllerName}.php`;
    const foundFile = controllerFiles.find(file => file.endsWith(controllerFile));
    return foundFile || 'Controller not found';
}

// Find the method that is associated with the controller file
function findControllerMethod(controllerPath: string, methodName: string): string | null {
    if (!fs.existsSync(controllerPath) || controllerPath === 'Controller not found') {
        return null;
    }

    const content = fs.readFileSync(controllerPath, 'utf-8');
    const methodRegex = new RegExp(`function\\s+${methodName}\\s*\\([^)]*\\)\\s*{`, 'i');
    const match = content.match(methodRegex);

    if (match) {
        const lines = content.slice(0, match.index).split('\n');
        return `Line ${lines.length}`;
    }

    return null;
}

// Search for Laravel routes and map them to controller methods
function findLaravelRoutesToController(routeFiles: string[], controllerFiles: string[]): RouteInfo[] {
    const routes: RouteInfo[] = [];

    for (const filePath of routeFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');

        const routeRegex = /Route::(get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^@'"]+)@([^'"]+)['"]\s*\)(?:->name\(['"]([^'"]+)['"]\))?/g;

        let match;
        while ((match = routeRegex.exec(content)) !== null) {
            const controllerName = match[3];
            const methodName = match[4];
            const controllerFilePath = findControllerFile(controllerFiles, controllerName);
            const controllerMethod = findControllerMethod(controllerFilePath, methodName);

            routes.push({
                routeName: match[5] || match[2],
                controllerName,
                methodName,
                routeFilePath: filePath,
                controllerFilePath,
                controllerMethod
            });
        }
    }

    return routes;
}

// Checking if the file is a Laravel route file
function isRouteFile(filePath: string): boolean {
    return filePath.includes(path.sep + 'routes' + path.sep) && filePath.endsWith('.php');
}

// Parsing the current line in the route file to extract the controller and method
function parseRouteLine(line: string): { controllerName: string, methodName: string } | null {
    const routeRegex = /Route::(get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^@'"]+)@([^'"]+)['"]\s*\)/;
    const match = line.match(routeRegex);

    if (match) {
        return {
            controllerName: match[3],
            methodName: match[4]
        };
    }

    return null;
}

// Find the line number where the method is located in the controller file
async function findMethodLineNumber(filePath: string, methodName: string): Promise<number> {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const methodRegex = new RegExp(`function\\s+${methodName}\\s*\\(`);

        for (let i = 0; i < lines.length; i++) {
            if (methodRegex.test(lines[i])) {
                return i + 1; // Convert to 1-based line number
            }
        }
        return -1;
    } catch (error) {
        return -1;
    }
}

// Display the Laravel routes and their corresponding controllers in a webview
function displayRoutes(routes: RouteInfo[]) {
    const panel = vscode.window.createWebviewPanel(
        'laravelRoutes',
        'Laravel Routes to Controllers',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
        }
    );

    const routesList = routes.map(route => `
        <tr>
            <td>${route.routeName}</td>
            <td>${route.controllerName}</td>
            <td>${route.methodName}</td>
            <td>${route.routeFilePath}</td>
            <td>${route.controllerFilePath}</td>
            <td>${route.controllerMethod || 'Method not found'}</td>
        </tr>
    `).join('');

    panel.webview.html = `
        <!DOCTYPE html>
        <html>
            <head>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/css/bootstrap.min.css" integrity="sha512-jnSuA4Ss2PkkikSOLtYs8BlYIeeIK1h99ty4YfvRPAlzr377vr3CXDb7sb7eEEBYjDtcYj+AjBH3FLv5uSJuXg==" crossorigin="anonymous" referrerpolicy="no-referrer" />
                <style>
                    #searchInput {
                        margin-bottom: 10px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2 class="my-4">Laravel Routes to Controllers</h2>
                    <input type="text" id="searchInput" class="form-control" placeholder="Search routes...">
                    <table class="table table-dark table-striped mt-3">
                        <thead>
                            <tr>
                                <th>Route Name</th>
                                <th>Controller</th>
                                <th>Method</th>
                                <th>Route File</th>
                                <th>Controller File</th>
                                <th>Method Location</th>
                            </tr>
                        </thead>
                        <tbody id="routesTable">
                            ${routesList}
                        </tbody>
                    </table>
                </div>

                <script>
                    const searchInput = document.getElementById('searchInput');
                    const routesTable = document.getElementById('routesTable');
                    const tableRows = routesTable.getElementsByTagName('tr');

                    searchInput.addEventListener('keyup', function() {
                        const searchValue = searchInput.value.toLowerCase();

                        for (let i = 0; i < tableRows.length; i++) {
                            const row = tableRows[i];
                            const cells = row.getElementsByTagName('td');
                            let match = false;

                            for (let j = 0; j < cells.length; j++) {
                                const cellValue = cells[j].textContent || cells[j].innerText;

                                if (cellValue.toLowerCase().includes(searchValue)) {
                                    match = true;
                                    break;
                                }
                            }

                            row.style.display = match ? '' : 'none';
                        }
                    });
                </script>
            </body>
        </html>
    `;
}

export function deactivate() {}
