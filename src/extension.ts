import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('laravelcontrollermethodfinder.findLaravelRoutesToController', () => {
        console.log("Working And Registerd")
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

        const routes = findLaravelRoutesToController(routesPath, controllersPath);
        displayRoutes(routes);
    });

    context.subscriptions.push(disposable);
}

interface RouteInfo {
    routeName: string;
    controllerName: string;
    methodName: string;
    routeFilePath: string;
    controllerFilePath: string;
    controllerMethod: string | null;
}

function findControllerFile(controllersPath: string, controllerName: string): string {
    const controllerFile = `${controllerName}.php`;
    const results: string[] = [];

    function searchDir(dirPath: string) {
        const files = fs.readdirSync(dirPath);
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                searchDir(filePath);
            } else if (file === controllerFile) {
                results.push(filePath);
            }
        }
    }

    searchDir(controllersPath);
    return results[0] || 'Controller not found';
}

function findControllerMethod(controllerPath: string, methodName: string): string | null {
    if (!fs.existsSync(controllerPath) || controllerPath === 'Controller not found') {
        return null;
    }

    const content = fs.readFileSync(controllerPath, 'utf-8');
    const methodRegex = new RegExp(`function\\s+${methodName}\\s*\\([^)]*\\)\\s*{`, 'i');
    
    const match = content.match(methodRegex);
    if (match) {
        // Get the line number of the method
        const lines = content.slice(0, match.index).split('\n');
        return `Line ${lines.length}`;
    }
    
    return null;
}

function findLaravelRoutesToController(routesPath: string, controllersPath: string): RouteInfo[] {
    const routes: RouteInfo[] = [];
    const routeFiles = fs.readdirSync(routesPath).filter(file => file.endsWith('.php'));

    for (const file of routeFiles) {
        const filePath = path.join(routesPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Regular expression to match Laravel routes
        const routeRegex = /Route::(get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^@'"]+)@([^'"]+)['"]\s*\)(?:->name\(['"]([^'"]+)['"]\))?/g;
        
        let match;
        while ((match = routeRegex.exec(content)) !== null) {
            const controllerName = match[3];
            const methodName = match[4];
            const controllerFilePath = findControllerFile(controllersPath, controllerName);
            const controllerMethod = findControllerMethod(controllerFilePath, methodName);

            routes.push({
                routeName: match[5] || match[2],
                controllerName: controllerName,
                methodName: methodName,
                routeFilePath: filePath,
                controllerFilePath: controllerFilePath,
                controllerMethod: controllerMethod
            });
        }
    }

    return routes;
}

function displayRoutes(routes: RouteInfo[]) {
    const panel = vscode.window.createWebviewPanel(
        'laravelRoutes',
        'Laravel Routes to Controllers',
        vscode.ViewColumn.One,
        {}
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
            </head>
            <body>
                <table class="table table-dark table-striped">
                    <tr>
                        <th>Route Name</th>
                        <th>Controller</th>
                        <th>Method</th>
                        <th>Route File</th>
                        <th>Controller File</th>
                        <th>Method Location</th>
                    </tr>
                    ${routesList}
                </table>
            </body>
        </html>
    `;
}

export function deactivate() {}