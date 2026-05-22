'use strict';

/**
 * Centralized emoji map for all economy commands.
 * Use these instead of hardcoded Unicode emojis for consistency.
 */
const EMOJIS = {
    // Currency & Money
    coin:       '<:Money:1473377877239140529>',
    money:      '<:Money:1473377877239140529>',
    wallet:     '<:Money:1473377877239140529>',
    bank:       '<:Invoice:1473039492217835550>',
    present:    '<:Present:1473038450465706076>',
    crown:      '<:Crown:1506010837368963142>',

    // Status & Feedback
    check:      '<:Checkedbox:1473038547165384804>',
    cancel:     '<:Cancel:1473037949187657818>',
    fire:       '<:Fire:1473038604812161218>',
    star:       '<:Star:1473038501766369300>',
    lightning:  '<:Lightning:1473038797540298792>',
    clock:      '<:Clock:1473039102113878056>',
    alarm:      '<:Alarm:1473039068546732214>',

    // Actions
    award:      '<:Award:1473038391632203887>',
    shield:     '<:Shield:1473038669831995494>',
    gamepad:    '<:Gamepad:1473039216429498409>',
    music:      '<:Music:1473039311057190972>',
    dice:       '<:Gamepad:1473039216429498409>',

    // UI
    info:       '<:Inforect:1473038624172937287>',
    settings:   '<:Settings:1473037894703779851>',
    edit:       '<:Editalt:1473038138577256670>',
    trash:      '<:Trash:1473038090074591293>',
    history:    '<:History:1473037847568318605>',
    bookopen:   '<:Bookopen:1473038576391557130>',
    document:   '<:Document:1473039496995143731>',
    eye:        '<:Eye:1473038435056095242>',
    lock:       '<:Lock:1473038513749491773>',
    user:       '<:User:1473038971398520977>',
    add:        '<:Add:1473038100862337035>',
    caretright: '<:Caretright:1473038207221502106>',

    // Shop & Items
    shop:       '<:Folder:1473039340425973972>',
    cart:       '<:Attach:1473037923979886694>',
    bag:        '<:Folder:1473039340425973972>',
    craft:      '<:Palette:1473039029476917461>',

    // Social
    heart:      '<:Heart:1473038659514007616>',
    chat:       '<:Chat:1473038936241864865>',
    bullhorn:   '<:Bullhorn:1473038903157199093>',
};

function buildCooldownBar(elapsed, total, length = 20) {
    const progress = Math.min(Math.floor((elapsed / total) * length), length);
    return '█'.repeat(progress) + '░'.repeat(length - progress);
}

function buildProgressBar(current, max, length = 15) {
    const filled = Math.min(Math.floor((current / max) * length), length);
    return '▓'.repeat(filled) + '░'.repeat(length - filled);
}

module.exports = { EMOJIS, buildCooldownBar, buildProgressBar };
