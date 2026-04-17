/* =========================
   * Navigation
   ========================= */
import BaseNavbar from "./layout/BaseNavbar";
import BaseFooter from "./layout/BaseFooter";

/* =========================
   * Proposal
   ========================= */
import ActionToolbar from "./ActionToolbar";

/* =========================
   * Proposal components
   ========================= */
// * Form
// Form components
import SingleItem from "./proposal/form/SingleItem";
import Charges from "./proposal/form/Charges";
import TemplateSelector from "./proposal/form/TemplateSelector";

// Form / Wizard
import WizardNavigation from "./proposal/form/wizard/WizardNavigation";
import WizardStep from "./proposal/form/wizard/WizardStep";
import WizardProgress from "./proposal/form/wizard/WizardProgress";

// Form / Sections
import BillFromSection from "./proposal/form/sections/BillFromSection";
import BillToSection from "./proposal/form/sections/BillToSection";
import ProposalDetails from "./proposal/form/sections/ProposalDetails";
import Items from "./proposal/form/sections/Items";
import PaymentInformation from "./proposal/form/sections/PaymentInformation";
import ProposalSummary from "./proposal/form/sections/ProposalSummary";
import ImportJsonButton from "./proposal/form/sections/ImportJsonButton";
import Screens from "./proposal/form/sections/Screens";
import SingleScreen from "./proposal/form/SingleScreen";

// * Actions
import PdfViewer from "./proposal/actions/PdfViewer";
import FinalPdf from "./proposal/actions/FinalPdf";

// * Reusable components
// Form fields
import CurrencySelector from "./reusables/form-fields/CurrencySelector";
import ExchangeRateInput from "./reusables/form-fields/ExchangeRateInput";
import FormInput from "./reusables/form-fields/FormInput";
import FormTextarea from "./reusables/form-fields/FormTextarea";
import DatePickerFormField from "./reusables/form-fields/DatePickerFormField";
import FormFile from "./reusables/form-fields/FormFile";
import ChargeInput from "./reusables/form-fields/ChargeInput";
import FormCustomInput from "./reusables/form-fields/FormCustomInput";
import FormSelect from "./reusables/form-fields/FormSelect";

import BaseButton from "./reusables/BaseButton";
import ThemeSwitcher from "./reusables/ThemeSwitcher";
import Subheading from "./reusables/Subheading";
import AiWand from "./reusables/AiWand";
import LogoSelector from "./reusables/LogoSelector";
import { ExcelDropzone } from "./reusables/ExcelDropzone";

/* =========================
   * AI-Generated SOW
   ========================= */
import { SOWGeneratorPanel } from "./proposal/SOWGeneratorPanel";
import { RiskBadge, RiskBadgeGroup, RiskCard } from "./proposal/RiskBadge";

/* =========================
   * Text Editor
   ========================= */
import { TextEditorPanel } from "./proposal/TextEditorPanel";

/* =========================
   * Modals & Alerts
   ========================= */
import SendPdfToEmailModal from "./modals/email/SendPdfToEmailModal";

// Import/Export
import ProposalLoaderModal from "./modals/proposal/ProposalLoaderModal";
import ProposalExportModal from "./modals/proposal/ProposalExportModal";

// Custom Selectors
import SavedProposalsList from "./modals/proposal/components/SavedProposalsList";

// Signature
import SignatureModal from "./modals/signature/SignatureModal";

// Signature / Tabs
import DrawSignature from "./modals/signature/tabs/DrawSignature";
import TypeSignature from "./modals/signature/tabs/TypeSignature";
import UploadSignature from "./modals/signature/tabs/UploadSignature";

// Signature / Components
import SignatureColorSelector from "./modals/signature/components/SignatureColorSelector";
import SignatureFontSelector from "./modals/signature/components/SignatureFontSelector";

// Alerts
import NewProposalAlert from "./modals/alerts/NewProposalAlert";
import NewProjectModal from "./modals/NewProjectModal";

/* =========================
   * Templates
   ========================= */
// Proposal templates
import DynamicProposalTemplate from "./templates/proposal-pdf/DynamicProposalTemplate";
import ProposalLayout from "./templates/proposal-pdf/ProposalLayout";


// Email templates
import SendPdfEmail from "./templates/email/SendPdfEmail";

export {
   BaseNavbar,
   BaseFooter,
   ActionToolbar,
   BillFromSection,
   BillToSection,
   ProposalDetails,
   Items,
   SingleItem,
   Charges,
   TemplateSelector,
   WizardNavigation,
   WizardStep,
   WizardProgress,
   PaymentInformation,
   ProposalSummary,
   CurrencySelector,
   ExchangeRateInput,
   SavedProposalsList,
   PdfViewer,
   FinalPdf,
   FormInput,
   FormTextarea,
   DatePickerFormField,
   FormFile,
   ChargeInput,
   FormCustomInput,
   Screens,
   SingleScreen,
   BaseButton,
   ThemeSwitcher,
   Subheading,
   AiWand,
   SendPdfToEmailModal,
   ProposalLoaderModal,
   ProposalExportModal,
   ImportJsonButton,
   SignatureModal,
   NewProjectModal,
   DrawSignature,
   TypeSignature,
   UploadSignature,
   SignatureColorSelector,
   SignatureFontSelector,
   NewProposalAlert,
   DynamicProposalTemplate,
   ProposalLayout,

   SendPdfEmail,
   FormSelect,
   LogoSelector,
   ExcelDropzone,
   SOWGeneratorPanel,
   RiskBadge,
   RiskBadgeGroup,
   RiskCard,
   TextEditorPanel,
};
