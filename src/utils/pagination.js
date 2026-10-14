


function createPagination(page, limit, total) {
  const currentPage = Math.max(1, parseInt(page) || 1);
  const itemsPerPage = Math.max(1, parseInt(limit) || 10);
  const totalItems = Math.max(0, parseInt(total) || 0);
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / itemsPerPage);
  const offset = (currentPage - 1) * itemsPerPage;
  
  return {
    page: currentPage,
    limit: itemsPerPage,
    total: totalItems,
    totalPages: totalPages,
    hasNext: totalPages > 0 ? currentPage < totalPages : false,
    hasPrev: totalPages > 0 ? currentPage > 1 : false,
    offset
  };
}


function normalizePagination(query) {
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 10), 100);
  const rawOffset = parseInt(query.offset, 10);
  if (query.offset !== undefined && query.offset !== null && query.offset !== '' && Number.isFinite(rawOffset)) {
    const offset = Math.max(0, rawOffset);
    return { page: Math.floor(offset / limit) + 1, limit, offset };
  }
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  return { page, limit, offset: (page - 1) * limit };
}


function calculateOffset(page, limit) {
  const currentPage = Math.max(1, parseInt(page) || 1);
  const itemsPerPage = Math.max(1, parseInt(limit) || 10);
  return (currentPage - 1) * itemsPerPage;
}


function calculatePage(offset, limit) {
  const currentOffset = Math.max(0, parseInt(offset) || 0);
  const itemsPerPage = Math.max(1, parseInt(limit) || 10);
  return Math.floor(currentOffset / itemsPerPage) + 1;
}

module.exports = {
  createPagination,
  calculateOffset,
  calculatePage,
  normalizePagination
};
