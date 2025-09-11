import {Menu, MenuItem} from "../models/menu.model.js";

// Create a new menu
export const createMenu = async (req, res) => {
    try {
        const menu = new Menu(req.body);
        await menu.save();
        res.status(201).json(menu);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all menus
export const getMenus = async (req, res) => {
    try {
        const menus = await Menu.find();
        res.status(200).json(menus);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Create a new menu item
export const createMenuItem = async (req, res) => {
    try {
        const menuItem = new MenuItem(req.body);
        await menuItem.save();
        res.status(201).json(menuItem);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all menu items
export const getMenuItems = async (req, res) => {
    try {
        const menuItems = await MenuItem.find();
        res.status(200).json(menuItems);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
