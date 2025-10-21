import {Menu, MenuItem} from "../models/menu.model.js";
import pkg from "json-2-csv";
const { AsyncParser } = pkg;
import * as XLSX from "xlsx";

// Create a new menu
export const createMenu = async (req, res) => {
    try {
        const userId = req.user._id;
        const menu = new Menu({ ...req.body, vendor: userId });
        await menu.save();
        res.status(201).json(menu);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all menus with search, filter, sort, and pagination
export const getMenus = async (req, res) => {
    try {
        const userId = req.user.role ? req.user._id : req.query.userId;
        const { page = 1, limit = 10, search, menuType, id, published, sortBy = "createdAt", sortOrder = "desc" } = req.query;

        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ];
        }

        if (menuType) {
            query.menuType = menuType;
        }

        if (id) {
            query.id = id;
        }

        if (published !== undefined) {
            query.published = published === "true";
        }

        // If the user is a vendor, restrict to their menus
        if (userId) {
            query.vendor = userId;
        }
        
        const totalMenus = await Menu.countDocuments(query);
        const sort = {};
        sort[sortBy] = sortOrder === "asc" ? 1 : -1;

        const menus = await Menu.find(query)
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.status(200).json({
            total: totalMenus,
            page: parseInt(page),
            limit: parseInt(limit),
            menus,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
        console.error(error)
    }
};

// Export menus to CSV
export const exportMenusCSV = async (req, res) => {
    try {
        const { search, menuType, published } = req.query;

        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ];
        }

        if (menuType) {
            query.menuType = menuType;
        }

        if (published !== undefined) {
            query.published = published === "true";
        }

        const menus = await Menu.find(query).lean();

        const dataToExport = menus.map((menu) => ({
            _id: menu._id,
            name: menu.name,
            description: menu.description,
            menuType: menu.menuType,
            mealTimes: menu.mealTimes.join(", "),
            pricingModel: menu.pricingModel,
            published: menu.published,
            createdAt: menu.createdAt ? menu.createdAt.toISOString() : "",
            updatedAt: menu.updatedAt ? menu.updatedAt.toISOString() : "",
        }));

        const { format = "csv" } = req.query; // Default to CSV

        if (format === "xlsx") {
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Menus");
            const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

            res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.attachment("menus.xlsx");
            return res.send(xlsxBuffer);
        } else {
            // Default to CSV
            const asyncParser = new AsyncParser();
            const csv = await asyncParser.parse(dataToExport);

            res.header("Content-Type", "text/csv");
            res.attachment("menus.csv");
            res.send(csv);
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Create a new menu item
export const createMenuItem = async (req, res) => {
    try {
        const userId = req.user._id;
        const menuItem = new MenuItem({ ...req.body, vendor: userId });
        await menuItem.save();
        res.status(201).json(menuItem);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all menu items with search, filter, sort, and pagination
export const getMenuItems = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, category, tags, availability, sortBy = "createdAt", sortOrder = "desc" } = req.query;
        const { userId }  = rew.query;

        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ];
        }

        if (category) {
            query.category = category;
        }

        if (tags) {
            query.tags = { $in: tags.split(",").map(tag => tag.trim()) };
        }

        if (availability !== undefined) {
            query.availability = availability === "true";
        }

        // If the user is a vendor, restrict to their menu items
        if (req.user.role) {
            query.vendor = String(userId);
        }

        const totalMenuItems = await MenuItem.countDocuments(query);
        const sort = {};
        sort[sortBy] = sortOrder === "asc" ? 1 : -1;

        const menuItems = await MenuItem.find(query)
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.status(200).json({
            total: totalMenuItems,
            page: parseInt(page),
            limit: parseInt(limit),
            menuItems,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Export menu items to CSV
export const exportMenuItemsCSV = async (req, res) => {
    try {
        const { search, category, tags, availability } = req.query;

        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ];
        }

        if (category) {
            query.category = category;
        }

        if (tags) {
            query.tags = { $in: tags.split(",").map(tag => tag.trim()) };
        }

        if (availability !== undefined) {
            query.availability = availability === "true";
        }

        const menuItems = await MenuItem.find(query).lean();

        const dataToExport = menuItems.map((item) => ({
            _id: item._id,
            name: item.name,
            description: item.description,
            price: item.price,
            category: item.category,
            tags: item.tags.join(", "),
            availability: item.availability,
            createdAt: item.createdAt ? item.createdAt.toISOString() : "",
            updatedAt: item.updatedAt ? item.updatedAt.toISOString() : "",
        }));

        const { format = "csv" } = req.query; // Default to CSV

        if (format === "xlsx") {
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "MenuItems");
            const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

            res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.attachment("menu_items.xlsx");
            return res.send(xlsxBuffer);
        } else {
            // Default to CSV
            const asyncParser = new AsyncParser();
            const csv = await asyncParser.parse(dataToExport);

            res.header("Content-Type", "text/csv");
            res.attachment("menu_items.csv");
            res.send(csv);
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update a menu
export const updateMenu = async (req, res) => {
    try {
        const { name, description, menuType, mealTimes, pricingModel, branches, published } = req.body;
        let coverImage = req.body.coverImage;

        const menu = await Menu.findById(req.params.id);

        if (!menu) {
            return res.status(404).json({ message: "Menu not found" });
        }

        // Handle image uploads if files are present
        if (req.files && req.files.coverImage && req.files.coverImage.length > 0) {
            coverImage = `/uploads/menu-images/${req.files.coverImage[0].filename}`; // Assuming local storage
        }

        menu.name = name || menu.name;
        menu.description = description || menu.description;
        menu.coverImage = coverImage || menu.coverImage; // Update if new image or provided in body
        menu.menuType = menuType || menu.menuType;
        menu.mealTimes = mealTimes || menu.mealTimes;
        menu.pricingModel = pricingModel || menu.pricingModel;
        menu.branches = branches || menu.branches;
        menu.published = published !== undefined ? published : menu.published;

        const updatedMenu = await menu.save();
        res.status(200).json(updatedMenu);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete a menu
export const deleteMenu = async (req, res) => {
    try {
        const menu = await Menu.findByIdAndDelete(req.params.id);
        if (menu) {
            res.status(200).json({ message: "Menu deleted successfully" });
        } else {
            res.status(404).json({ message: "Menu not found" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update a menu item
export const updateMenuItem = async (req, res) => {
    try {
        const menuItem = await MenuItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (menuItem) {
            res.status(200).json(menuItem);
        } else {
            res.status(404).json({ message: "Menu item not found" });
        }
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete a menu item
export const deleteMenuItem = async (req, res) => {
    try {
        const menuItem = await MenuItem.findByIdAndDelete(req.params.id);
        if (menuItem) {
            res.status(200).json({ message: "Menu item deleted successfully" });
        } else {
            res.status(404).json({ message: "Menu item not found" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Reorder menu item images
export const reorderMenuItemImages = async (req, res) => {
    try {
        const { id } = req.params; // MenuItem ID
        const { imageOrder } = req.body; // Array of image URLs in desired order

        const menuItem = await MenuItem.findById(id);
        if (!menuItem) {
            return res.status(404).json({ message: "Menu item not found" });
        }

        // Validate if all imageOrder URLs exist in the current images array
        const isValidOrder = imageOrder.every(url => menuItem.images.includes(url));
        if (!isValidOrder || imageOrder.length !== menuItem.images.length) {
            return res.status(400).json({ message: "Invalid image order provided. All original images must be present." });
        }

        menuItem.images = imageOrder;
        await menuItem.save();

        res.status(200).json(menuItem);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Bulk assign menus to branches
export const bulkAssignMenusToBranches = async (req, res) => {
    try {
        const { menuIds, branchIds } = req.body; // Arrays of menu IDs and branch IDs

        if (!Array.isArray(menuIds) || menuIds.length === 0) {
            return res.status(400).json({ message: "No menu IDs provided for bulk assignment." });
        }
        if (!Array.isArray(branchIds) || branchIds.length === 0) {
            return res.status(400).json({ message: "No branch IDs provided for bulk assignment." });
        }

        // Update menus to add branches
        const result = await Menu.updateMany(
            { _id: { $in: menuIds } },
            { $addToSet: { branches: { $each: branchIds } } } // Add branches without duplicates
        );

        res.status(200).json({
            message: `${result.modifiedCount} menus updated successfully.`,
            modifiedCount: result.modifiedCount,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
