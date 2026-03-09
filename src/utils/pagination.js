const buildMeta = (total, page, pageSize) => ({
  page,
  pageSize,
  total,
  totalPages: Math.ceil(total / pageSize),
});

const buildSkipTake = (page, pageSize) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});

module.exports = { buildMeta, buildSkipTake };