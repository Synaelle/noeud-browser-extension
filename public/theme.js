// Runs before the page paints, so it opens in the chosen theme without a flash. The options
// page keeps this copy in step with the choice stored in storage.local.
if (localStorage.getItem('noeud-theme') === 'light') document.documentElement.dataset.theme = 'light'
