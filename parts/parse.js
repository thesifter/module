/*global esprima */
var parse;
(function() {
  //From an esprima example for traversing its ast.
  function traverse(object, visitor) {
    var key, child;

    if (!object) {
      return;
    }

    if (visitor.call(null, object) === false) {
      return false;
    }
    for (key in object) {
      if (object.hasOwnProperty(key)) {
        child = object[key];
        if (typeof child === 'object' && child !== null) {
          if (traverse(child, visitor) === false) {
            return false;
          }
        }
      }
    }
  }

  //Like traverse, but visitor returning false just
  //stops that subtree analysis, not the rest of tree
  //visiting.
  function traverseBroad(object, visitor) {
    var key, child;

    if (!object) {
      return;
    }

    if (visitor.call(null, object) === false) {
      return false;
    }
    for (key in object) {
      if (object.hasOwnProperty(key)) {
        child = object[key];
        if (typeof child === 'object' && child !== null) {
          traverseBroad(child, visitor);
        }
      }
    }
  }

  function matchesCallExpression(node, objectName, propertyName) {
    return node.type === 'CallExpression' && node.callee &&
           node.callee.type === 'MemberExpression' && node.callee.object &&
           node.callee.object.name === objectName && node.callee.property &&
           node.callee.property.name === propertyName;
  }

  function matchesMemberExpression(node, objectName, propertyName) {
    return node.type === 'MemberExpression' && node.object &&
           node.object.type === 'Identifier' &&
           node.object.name === objectName && node.property &&
           node.property.type === 'Identifier' &&
           node.property.name === propertyName;
  }

  parse = {
    traverse: traverse,
    traverseBroad: traverseBroad,

    // Parses factory function for module() dependencies,
    // as well as module.define IDs that are local to a module.
    fromFactory: function(fn) {
      return parse.fromBody('(' + fn.toString() + ')');
    },

    // Parses a possible module body for module API usage:
    // module(StringLiteral)
    // module.define()
    // module.exportFromLocal()
    fromBody: function (bodyText, apiName) {
      // Convert to string, add parens around it so valid esprima
      // parse form.
      var usesExportFromLocal = false,
          usesExport = false,
          astRoot = esprima.parse(bodyText),
          deps = [],
          localModules = [];

      traverseBroad(astRoot, function(node) {
        // Minified code could have changed the name of `module` to something
        // else, so find it. It will be the first function expression.
        if (!apiName && node.type === 'FunctionExpression' &&
            node.params && node.params.length === 1) {
          apiName = node.params[0].name;
          return;
        }

        // Look for dependencies
        if (node.type === 'CallExpression' &&
            node.callee &&
            node.callee.type === 'Identifier' &&
            node.callee.name === apiName &&
            node.arguments &&
            node.arguments.length === 1 &&
            node.arguments[0].type === 'Literal') {
          var dep = node.arguments[0].value;
          if (deps.indexOf(dep) === -1) {
            deps.push(dep);
          }
        }

        // Look for local module defines, but only top level,
        // do not inspect inside of them if found.
        if (matchesCallExpression(node, apiName, 'define')) {
          var localModule = node.arguments[0].value;
          localModules.push(localModule);
          return false;
        }

        // Look for module.exportFromLocal, since it indicates this code is
        // a module, and needs a module function wrapping.
        if (matchesCallExpression(node, apiName, 'exportFromLocal')) {
          usesExportFromLocal = true;
          return false;
        }

        // Look for module.export, since it indicates this code is
        // a module, and needs a module function wrapping.
        if (matchesMemberExpression(node, apiName, 'export')) {
          // uses set, and continue parsing lower, since set
          // usage could use get inside to construct the export
          usesExport = true;
        }
      });

      return {
        deps: deps,
        localModules: localModules,
        usesExportFromLocal: usesExportFromLocal,
        isModule: !!(deps.length || usesExportFromLocal || usesExport)
      };
    }
  };

}());

