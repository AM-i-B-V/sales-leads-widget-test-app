// Configuration Constants
const SITE_KEY = import.meta.env.VITE_SITE_KEY;
const SALES_LEADS_WIDGET_URL = import.meta.env.VITE_API_ENDPOINT;

// Import dealer data
import { getDealersForDropdown } from "./dealers.js";

// DOM Elements
const elements = {
  form: document.getElementById("leadForm"),
  submitBtn: document.getElementById("submitBtn"),
  turnstileContainer: document.getElementById("turnstile-container"),
  statusMessage: document.getElementById("statusMessage"),
};

// State Management
let turnstileCredentials = null;

// UI Utilities
const UIManager = {
  setSubmitEnabled(enabled) {
    elements.submitBtn.disabled = !enabled;
    elements.submitBtn.style.cursor = enabled ? "pointer" : "not-allowed";
    elements.submitBtn.style.backgroundColor = enabled
      ? "var(--primary-red)"
      : "var(--disabled-color)";
  },

  showStatus(message, type) {
    elements.statusMessage.style.display = "block";
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message ${type}`;

    if (type === "success") {
      setTimeout(() => {
        elements.statusMessage.style.display = "none";
      }, 5000);
    }
  },
};

// Turnstile Manager
const TurnstileManager = (() => {
  let widgetId = null;

  const handleCallback = (token) => {
    turnstileCredentials = { token, siteKey: SITE_KEY };
    UIManager.setSubmitEnabled(true);
    UIManager.showStatus(
      "Verification successful! You can now submit the form.",
      "success"
    );
  };

  const handleError = () => {
    turnstileCredentials = null;
    UIManager.setSubmitEnabled(false);
    console.log("turnstile challenge failed");
    UIManager.showStatus(
      "There was an error with the Turnstile challenge. Please try again.",
      "error"
    );
  };

  const handleExpired = () => {
    turnstileCredentials = null;
    UIManager.setSubmitEnabled(false);
    console.log("Token expired, please refresh");
    UIManager.showStatus(
      "Turnstile challenge expired. Please verify again.",
      "error"
    );
  };

  const handleTimeout = () => {
    console.log("Challenge timed out, please try again");
    UIManager.showStatus("Challenge timed out, please try again", "error");
    refresh();
  };

  const refresh = () => {
    if (widgetId !== null) {
      window.turnstile.reset(widgetId);
    }
    UIManager.setSubmitEnabled(false);
    turnstileCredentials = null;
  };

  const render = () => {
    UIManager.setSubmitEnabled(false);
    widgetId = window.turnstile.render("#turnstile-container", {
      sitekey: SITE_KEY,
      appearance: "always",
      theme: "light",
      size: "normal",
      action: "submit_form",
      callback: handleCallback,
      "error-callback": handleError,
      "expired-callback": handleExpired,
      "timeout-callback": handleTimeout,
      "refresh-timeout": "auto",
    });
  };

  return {
    render,
    refresh,
  };
})();

// Form Manager
const FormManager = (() => {
  const initializeDealerDropdown = () => {
    const dealerSelect = document.getElementById("dealerId");
    const dealers = getDealersForDropdown();

    dealers.forEach((dealer) => {
      const option = document.createElement("option");
      option.value = dealer.value;
      option.textContent = dealer.label;
      dealerSelect.appendChild(option);
    });
  };

  const validate = () => {
    const requiredFields = elements.form.querySelectorAll("[required]");
    const allFilled = Array.from(requiredFields).every(
      (field) => field.value.trim() !== ""
    );

    const canSubmit =
      allFilled && turnstileCredentials && turnstileCredentials.token;
    UIManager.setSubmitEnabled(canSubmit);
  };

  const buildLeadPayload = (data) => {
    const leadPayload = {
      initiative: data.initiative,
      source: data.source,
      leadType: data.leadType,
      dealerId: data.dealerId,
      prospect: {
        firstName: data.firstName,
        lastName: data.lastName,
        emailAddress: data.emailAddress,
        phoneNumber: data.phoneNumber,
        address: data.address,
        preferredCommunicationChannel: data.preferredCommunicationChannel,
      },
      title: data.title,
      customerMessage: data.customerMessage,
      channel: data.channel,
      campaign: data.campaign,
      leadDepartment: data.leadDepartment,
      correlationId: data.correlationId,
      externalLink: data.externalLink,
      advertisementLink: data.advertisementLink,
    };

    // Clean up undefined and empty values
    Object.keys(leadPayload).forEach((key) => {
      if (leadPayload[key] === undefined || leadPayload[key] === "") {
        delete leadPayload[key];
      }
    });

    Object.keys(leadPayload.prospect).forEach((key) => {
      if (
        leadPayload.prospect[key] === undefined ||
        leadPayload.prospect[key] === ""
      ) {
        delete leadPayload.prospect[key];
      }
    });

    return leadPayload;
  };

  const submitLead = async (leadPayload) => {
    const response = await fetch(SALES_LEADS_WIDGET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Site-Key": turnstileCredentials.siteKey,
        "Turnstile-Token": turnstileCredentials.token,
      },
      body: JSON.stringify(leadPayload),
    });

    if (!response.ok) {
      throw new Error(
        responseData.message || `HTTP error! status: ${response.status}`
      );
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!turnstileCredentials || !turnstileCredentials.token) {
      UIManager.showStatus("Please complete the verification first.", "error");
      return;
    }

    UIManager.setSubmitEnabled(false);
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);

    try {
      const leadPayload = buildLeadPayload(data);
      await submitLead(leadPayload);

      UIManager.showStatus("Lead submitted successfully!", "success");
      TurnstileManager.refresh();
    } catch (error) {
      TurnstileManager.refresh();
      console.error("Error submitting form:", error);
      UIManager.showStatus(
        "There was an error submitting the form. Please try again.",
        "error"
      );
    }
  };

  const setupEventListeners = () => {
    elements.form.addEventListener("submit", handleSubmit);

    const requiredFields = elements.form.querySelectorAll("[required]");
    requiredFields.forEach((field) => {
      field.addEventListener("input", validate);
    });

    validate();
  };

  const initialize = () => {
    initializeDealerDropdown();
    setupEventListeners();
    UIManager.showStatus(
      "Please fill out the form and complete the verification to continue.",
      "info"
    );
  };

  return {
    initialize,
  };
})();

// Application Initialization
document.addEventListener("DOMContentLoaded", () => {
  FormManager.initialize();

  // Initialize Turnstile
  if (window.turnstile) {
    TurnstileManager.render();
  } else {
    const interval = setInterval(() => {
      if (window.turnstile) {
        clearInterval(interval);
        TurnstileManager.render();
      }
    }, 100);
  }
});
