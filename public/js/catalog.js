import {
  getPapers,
  getPaperFields,
  createPaper,
  updatePaper,
  deletePaper,
  createEntry,
  getEntries,
} from "./api.js";
import { paperCard } from "./components/paper-card.js";
import { el, clear, setStatus } from "./dom.js";

const searchForm = document.getElementById("search-form");
const searchError = document.getElementById("search-error");
const fieldSelect = document.getElementById("field");
const clearButton = document.getElementById("clear-search");

const paperDialog = document.getElementById("paper-dialog");
const openDialogButton = document.getElementById("open-paper-dialog");
const paperForm = document.getElementById("paper-form");
const paperIdField = document.getElementById("paper-id");
const submitButton = document.getElementById("submit-button");
const cancelButton = document.getElementById("cancel-edit");
const formHeading = document.getElementById("form-heading");
const formError = document.getElementById("form-error");

const statusLine = document.getElementById("status");
const saveMessage = document.getElementById("save-message");
const resultsList = document.getElementById("results");
const pager = document.getElementById("pager");
const pageLabel = document.getElementById("page-label");
const prevButton = document.getElementById("prev");
const nextButton = document.getElementById("next");
const sortSelect = document.getElementById("sort-papers");

const LIMIT = 24;
const state = { q: "", field: "", yearFrom: "", yearTo: "", page: 1, totalPages: 1 };

let savedTitles = new Set();

function titleKey(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function loadSavedTitles() {
  try {
    const payload = await getEntries();
    savedTitles = new Set(payload.items.map((entry) => titleKey(entry.title)));
  } catch {
    savedTitles = new Set();
  }
}

function showError(node, message) {
  node.textContent = message;
  node.hidden = false;
}

function hideError(node) {
  node.hidden = true;
  node.textContent = "";
}

async function loadFields() {
  try {
    const payload = await getPaperFields();

    payload.fields.forEach((entry) => {
      const option = el("option", "", entry.name + " (" + entry.count + ")");
      option.value = entry.name;
      fieldSelect.appendChild(option);
    });
  } catch {
    // The dropdown is a convenience. Search still works without it.
  }
}

function renderEmpty() {
  const empty = el("li", "empty");
  empty.appendChild(
    el("p", "", "No papers match those filters. Try fewer words or a wider year range.")
  );
  resultsList.appendChild(empty);
}

async function load() {
  setStatus(statusLine, "Loading the catalog...");

  try {
    const [payload] = await Promise.all([
      getPapers({
        q: state.q,
        field: state.field,
        yearFrom: state.yearFrom,
        yearTo: state.yearTo,
        page: state.page,
        limit: LIMIT,
        sort: sortSelect.value,
      }),
      loadSavedTitles(),
    ]);

    const { items, total, limit } = payload;
    state.totalPages = Math.max(1, Math.ceil(total / limit));

    if (items.length === 0 && total > 0 && state.page > state.totalPages) {
      state.page = state.totalPages;
      await load();
      return;
    }

    clear(resultsList);

    if (items.length === 0) {
      renderEmpty();
      pager.hidden = true;
      setStatus(statusLine, "0 papers found.");
      return;
    }

    items.forEach((paper) =>
      resultsList.appendChild(
        paperCard(paper, {
          onSave: saveToList,
          onEdit: startEdit,
          onDelete: remove,
          saved: savedTitles.has(titleKey(paper.title)),
        })
      )
    );

    const first = (state.page - 1) * limit + 1;
    const last = first + items.length - 1;
    setStatus(
      statusLine,
      "Showing " + first + " to " + last + " of " + total.toLocaleString() + " papers."
    );

    pager.hidden = state.totalPages <= 1;
    pageLabel.textContent = "Page " + state.page + " of " + state.totalPages;
    prevButton.disabled = state.page <= 1;
    nextButton.disabled = state.page >= state.totalPages;
  } catch (error) {
    clear(resultsList);
    pager.hidden = true;
    setStatus(statusLine, "Could not load the catalog. " + error.message, true);
  }
}

function onSearch(event) {
  event.preventDefault();
  hideError(searchError);

  const data = new FormData(searchForm);
  const yearFrom = String(data.get("yearFrom") || "").trim();
  const yearTo = String(data.get("yearTo") || "").trim();

  if (yearFrom && yearTo && Number(yearFrom) > Number(yearTo)) {
    showError(searchError, "From year cannot be after to year.");
    return;
  }

  state.q = String(data.get("q") || "").trim();
  state.field = String(data.get("field") || "");
  state.yearFrom = yearFrom;
  state.yearTo = yearTo;
  state.page = 1;
  load();
}

function onClear() {
  searchForm.reset();
  hideError(searchError);
  Object.assign(state, { q: "", field: "", yearFrom: "", yearTo: "", page: 1 });
  load();
}

function toEntry(paper) {
  return {
    title: paper.title,
    authors: paper.authors,
    year: paper.year ? String(paper.year) : "",
    venue: (paper.venue || "").slice(0, 200),
    status: "to-read",
    priority: "medium",
    tags: "",
    note: "",
  };
}

async function saveToList(paper, button) {
  button.disabled = true;

  try {
    await createEntry(toEntry(paper));
    savedTitles.add(titleKey(paper.title));
    button.textContent = "Saved to list";
    button.setAttribute("aria-label", paper.title + " is saved to your reading list");
    setStatus(
      saveMessage,
      'Saved "' +
        paper.title +
        '" to your reading list. Open My reading list to add your note.'
    );
  } catch (error) {
    button.disabled = false;
    setStatus(saveMessage, "Could not save that paper. " + error.message, true);
  }
}

function readPaperForm() {
  const data = new FormData(paperForm);
  const paper = {
    title: String(data.get("title") || "").trim(),
    authors: String(data.get("authors") || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
    venue: String(data.get("venue") || "").trim(),
    doi: String(data.get("doi") || "").trim(),
    abstract: String(data.get("abstract") || "").trim(),
  };

  const year = String(data.get("year") || "").trim();
  if (year) {
    paper.year = Number(year);
  }

  return paper;
}

function resetPaperForm() {
  paperForm.reset();
  paperIdField.value = "";
  formHeading.textContent = "Add a paper";
  submitButton.textContent = "Add paper";
  hideError(formError);
}

function openAddDialog() {
  resetPaperForm();
  paperDialog.showModal();
}

function startEdit(paper) {
  paperIdField.value = paper._id;
  paperForm.elements.title.value = paper.title || "";
  paperForm.elements.authors.value = Array.isArray(paper.authors)
    ? paper.authors.join(", ")
    : "";
  paperForm.elements.venue.value = paper.venue || "";
  paperForm.elements.year.value = paper.year || "";
  paperForm.elements.doi.value = paper.doi || "";
  paperForm.elements.abstract.value = paper.abstract || "";

  formHeading.textContent = "Edit paper";
  submitButton.textContent = "Save changes";
  hideError(formError);

  paperDialog.showModal();
  paperForm.elements.title.focus();
}

async function remove(paper) {
  if (!window.confirm('Delete "' + paper.title + '" from the catalog for everyone?')) {
    return;
  }

  try {
    await deletePaper(paper._id);
    await load();
  } catch (error) {
    setStatus(statusLine, "Could not delete that paper. " + error.message, true);
  }
}

async function onSavePaper(event) {
  event.preventDefault();
  hideError(formError);

  const paper = readPaperForm();

  if (!paper.title) {
    showError(formError, "Title is required.");
    return;
  }

  const editingId = paperIdField.value;
  submitButton.disabled = true;

  try {
    if (editingId) {
      await updatePaper(editingId, paper);
      paperDialog.close();
      await load();
    } else {
      await createPaper(paper);
      paperDialog.close();
      searchForm.reset();
      searchForm.elements.q.value = paper.title;
      Object.assign(state, {
        q: paper.title,
        field: "",
        yearFrom: "",
        yearTo: "",
        page: 1,
      });
      await load();
    }
  } catch (error) {
    showError(formError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

searchForm.addEventListener("submit", onSearch);
clearButton.addEventListener("click", onClear);

openDialogButton.addEventListener("click", openAddDialog);
cancelButton.addEventListener("click", () => paperDialog.close());
paperForm.addEventListener("submit", onSavePaper);

paperDialog.addEventListener("close", resetPaperForm);

paperDialog.addEventListener("click", (event) => {
  if (event.target === paperDialog) {
    paperDialog.close();
  }
});

prevButton.addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    load();
  }
});

nextButton.addEventListener("click", () => {
  if (state.page < state.totalPages) {
    state.page += 1;
    load();
  }
});


sortSelect.addEventListener("change", () => {
  state.page = 1;
  load();
});


loadFields();
load();
