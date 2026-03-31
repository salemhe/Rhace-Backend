import Table from "../models/table.model.js";

export const createTable = async (req, res) => {
  try {
    if (req.user.role === "vendor") {
      if (req.body.clubId && req.body.clubId !== req.user._id.toString()) {
        return res.status(403).json({ 
          message: "Forbidden: You can only create Tables for your own club.",
          yourVendorId: req.user._id.toString(),
          providedClubId: req.body.clubId,
          hint: "Make sure the clubId in your request matches your vendor ID, or omit it entirely"
        });
      }
      req.body.clubId = req.user._id.toString();
    }
    const { clubId, name, price, addOns, quantityAvailable, seatingCapacity, category, description } = req.body;

    const table = new Table({clubId, name, price, addOns, quantityAvailable, seatingCapacity, category, description });
    await table.save();
    res.status(201).json(table);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
export const getTables = async (req, res) => {
  try {
    let { clubId, search, page = 1, limit = 1000, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    if (req.user && req.user.role === "vendor") {
      clubId = req.user._id.toString();
    }

    let query = { clubId };

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const totalTables = await Table.countDocuments(query);

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const tables = await Table.find(query)
      .populate('quantityAvailable seatingCapacity name')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const tablesWithCapacity = tables.map(table => ({
      ...table.toObject(),
      seatingCapacity: table?.seatingCapacity || 0,
      quantityAvailable: table?.quantityAvailable || 0,
    }));

    res.status(200).json({
      total: totalTables,
      page: parseInt(page),
      limit: parseInt(limit),
      tables: tablesWithCapacity,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getTableById = async (req, res) => {
  try {
    const { id } = req.params;
    const table = await Table.findById(id).populate('quantityAvailable seatingCapacity name');
    if (!table) {
      return res.status(404).json({ message: "Table not found" });
    }
    const tableWithCapacity = {
      ...table.toObject(),
      seatingCapacity: table?.seatingCapacity || 0,
      quantityAvailable: table?.quantityAvailable || 0,
    };
    res.status(200).json(tableWithCapacity);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  };


export const updateTable = async (req, res) => {
  try {
    const { id } = req.params;
    const table = await Table.findById(id);
    if (!table) {
      return res.status(404).json({ message: "Table not found" });
    }

    if (req.user.role === "vendor") {
      if (table.clubId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Forbidden: You can only update Tables for your own club." });
      }
    }

    const { clubId, name, price, addOns, quantityAvailable, seatingCapacity, category, description } = req.body;

    const updatedTable = await Table.findByIdAndUpdate(id, { clubId, name, price, addOns, quantityAvailable, seatingCapacity, category, description }, { new: true }).populate( 'quantityAvailable seatingCapacity name');
    const updatedTableWithCapacity = {
      ...updatedTable.toObject(),
      seatingCapacity: updatedTable?.seatingCapacity || 0,
      quantityAvailable: updatedTable?.quantityAvailable || 0,
    };
    res.status(200).json(updatedTableWithCapacity);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


export const deleteTable = async (req, res) => {
  try {
    const { id } = req.params;
    const table = await Table.findById(id);
    if (!table) {
      return res.status(404).json({ message: "Table not found" });
    }

    if (req.user.role === "vendor") {
      if (table.clubId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Forbidden: You can only delete Tables for your own club." });
      }
    }

    await Table.findByIdAndDelete(id);
    res.status(200).json({ message: "Table removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};