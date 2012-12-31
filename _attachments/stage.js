function stage(container) {
    var stage = {};
    
    var root = d3.select(container).html('').classed('stage', true),
            menuBar = root.append('header').classed('menuBar', true),
                backButton = menuBar.append('a').classed('action', true).classed('back', true).text("← Back"),
                mainTitle = menuBar.append('h1').classed('title', true).classed('bar', true).text("Untitled scene"),
                menuButton = menuBar.append('a').classed('action', true).classed('menu', true).text("Edit…"),
            content = root.append('div').classed('mainContent', true),
            dialog = root.append('div').classed('dialog', true).style('display', "none"),
                dialogFrame = dialog.append('div').classed('frame', true),
                    dialogTitle = dialogFrame.append('h2').text("Extra options"),
                    dialogContent = dialogFrame.append('div').classed('dialogContent', true),
                    dialogDone = dialogFrame.append('a').classed('action', true).classed('done', true).text("Done");
    
    // WORKAROUND: Firefox won't display [old-style] flexbox if positioned absolute http://stackoverflow.com/a/9163605/179583
    if (~navigator.userAgent.indexOf('Firefox')) menuBar.style('position', "static").style('width', "100%");
    
    /*
    mainStage.push(function () {
        this.scene("Shapes", function (container) {
            // set up main view
            return function () {
                // tear down main view
            };
        })
        this.title(doc.title, "Zoom to extent", function () {
        
        })
        this.extra("Options", "View layer options", function () {
            
        });
    });
    */
    
    var scenes = [],
        exitPreviousView;
    function activate(scene, prev) {
        var backTitle = "Back", backTooltip = "Return to previous";
        var modifiers = {
            back: function (title, tip, action) {
                if (title) backButton.style('display', null).text("← " + title).attr('title', tip).on('click', action);
                else backButton.style('display', "none");
            },
            scene: function (nickname, view, data) {
                backTitle = nickname;
                if (exitPreviousView) exitPreviousView();
                exitPreviousView = view(content.node(), data);
            },
            title: function (title, tip, action) {
                backTooltip = "Return to " + title;
                mainTitle.text(title).attr('title', tip || null).on('click', action || null);
            },
            extra: function (title, tip, dialog) {
                if (title) menuButton.style('display', null).text(title + "…").attr('title', tip).on('click', function () {
                    stage.dialog(tip, dialog);
                });
                else menuButton.style('display', "none");
            }
        };
        modifiers.back(prev.title, prev.tooltip, stage.pop);
        modifiers.scene("Back", function () {});
        modifiers.title("Return to previous");
        modifiers.extra(null);
        scene.call(modifiers);
        stage.dialog(null);
        return {title:backTitle, tooltip:backTooltip};
    }
    stage.push = function (scene) {
        var prev = scenes[scenes.length - 1],
            sceneInfo = activate(scene, prev || {});
        sceneInfo.scene = scene;
        scenes.push(sceneInfo);
    };
    stage.pop = function () {
        scenes.pop();
        var scene = scenes[scenes.length - 1].scene,
            prev = scenes[scenes.length - 2],
            sceneInfo = activate(scene, prev || {});
        sceneInfo.scene = scene;
        scenes[scenes.length - 1] = sceneInfo;
    };
    
    var cleanupDialog;
    stage.dialog = function (title, view, data) {
        if (title) {
            dialog.style('display', null);
            dialogTitle.text(title);
            cleanupDialog = view(dialogContent.node(), data);
            dialogDone.on('click', function () { stage.dialog(null); });
        } else {
            if (cleanupDialog) cleanupDialog();
            dialog.style('display', "none");
        }
    };
    return stage;
};