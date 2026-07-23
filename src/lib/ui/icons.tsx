/**
 * App icon layer — Polaris Icons per visual spec §3.5.
 * Import from here instead of `lucide-react`.
 */
import type { ComponentProps } from "react";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsOutHorizontalIcon,
  AutomationIcon,
  BlankIcon,
  CartIcon,
  CashDollarIcon,
  ChartDonutIcon,
  ChartHistogramFlatIcon,
  ChartLineIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClipboardChecklistIcon,
  ClockIcon,
  CollectionIcon,
  ContractIcon,
  DatabaseIcon,
  DeleteIcon,
  DeliveryIcon,
  EditIcon,
  EmailIcon,
  ExitIcon,
  ExportIcon,
  ExternalIcon,
  FileIcon,
  GlobeIcon,
  ImageAltIcon,
  InventoryIcon,
  LayoutColumns3Icon,
  LayoutSidebarRightIcon,
  LightbulbIcon,
  LinkIcon,
  LockIcon,
  MagicIcon,
  MeasurementWeightIcon,
  MinusCircleIcon,
  PackageIcon,
  PersonIcon,
  PlusIcon,
  ProductIcon,
  RefreshIcon,
  SaveIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  ShieldCheckMarkIcon,
  SidekickIcon,
  StoreIcon,
  TargetIcon,
  WandIcon,
  XIcon,
} from "@shopify/polaris-icons";
import { Spinner } from "@/components/ui/spinner";
import { createPolarisIcon } from "@/lib/ui/polaris-icon";
import { cn } from "@/lib/utils";

export const AlertTriangle = createPolarisIcon(AlertTriangleIcon, "AlertTriangle");
export const ArrowLeft = createPolarisIcon(ArrowLeftIcon, "ArrowLeft");
export const ArrowLeftRight = createPolarisIcon(ArrowsOutHorizontalIcon, "ArrowLeftRight");
export const ArrowRight = createPolarisIcon(ArrowRightIcon, "ArrowRight");
export const Bot = createPolarisIcon(SidekickIcon, "Bot");
export const Boxes = createPolarisIcon(InventoryIcon, "Boxes");
export const Check = createPolarisIcon(CheckIcon, "Check");
export const CheckCircle2 = createPolarisIcon(CheckCircleIcon, "CheckCircle2");
export const ChevronDown = createPolarisIcon(ChevronDownIcon, "ChevronDown");
export const ChevronLeft = createPolarisIcon(ChevronLeftIcon, "ChevronLeft");
export const ChevronRight = createPolarisIcon(ChevronRightIcon, "ChevronRight");
export const ChevronUp = createPolarisIcon(ChevronUpIcon, "ChevronUp");
export const Clock = createPolarisIcon(ClockIcon, "Clock");
export const Coins = createPolarisIcon(CashDollarIcon, "Coins");
export const Crosshair = createPolarisIcon(TargetIcon, "Crosshair");
export const Database = createPolarisIcon(DatabaseIcon, "Database");
export const Download = createPolarisIcon(ExportIcon, "Download");
export const ExternalLink = createPolarisIcon(ExternalIcon, "ExternalLink");
export const Exit = createPolarisIcon(ExitIcon, "Exit");
export const FileText = createPolarisIcon(FileIcon, "FileText");
export const Globe = createPolarisIcon(GlobeIcon, "Globe");
export const ImageOff = createPolarisIcon(ImageAltIcon, "ImageOff");
export const Inbox = createPolarisIcon(EmailIcon, "Inbox");
export const Layers = createPolarisIcon(CollectionIcon, "Layers");
export const LayoutGrid = createPolarisIcon(LayoutColumns3Icon, "LayoutGrid");
export const Lightbulb = createPolarisIcon(LightbulbIcon, "Lightbulb");
export const LineChart = createPolarisIcon(ChartLineIcon, "LineChart");
export const Link2 = createPolarisIcon(LinkIcon, "Link2");
export const ListChecks = createPolarisIcon(ClipboardChecklistIcon, "ListChecks");
export const Lock = createPolarisIcon(LockIcon, "Lock");
export const MinusCircle = createPolarisIcon(MinusCircleIcon, "MinusCircle");
export const MoveRight = createPolarisIcon(ArrowRightIcon, "MoveRight");
export const Package = createPolarisIcon(PackageIcon, "Package");
export const PanelRight = createPolarisIcon(LayoutSidebarRightIcon, "PanelRight");
export const PanelRightClose = createPolarisIcon(ContractIcon, "PanelRightClose");
export const Pencil = createPolarisIcon(EditIcon, "Pencil");
export const Person = createPolarisIcon(PersonIcon, "Person");
export const PieChart = createPolarisIcon(ChartDonutIcon, "PieChart");
export const Plus = createPolarisIcon(PlusIcon, "Plus");
export const RefreshCw = createPolarisIcon(RefreshIcon, "RefreshCw");
export const Save = createPolarisIcon(SaveIcon, "Save");
export const Scale = createPolarisIcon(MeasurementWeightIcon, "Scale");
export const Search = createPolarisIcon(SearchIcon, "Search");
export const Send = createPolarisIcon(SendIcon, "Send");
export const Settings = createPolarisIcon(SettingsIcon, "Settings");
export const ShieldCheck = createPolarisIcon(ShieldCheckMarkIcon, "ShieldCheck");
export const ShoppingBag = createPolarisIcon(CartIcon, "ShoppingBag");
export const Sparkles = createPolarisIcon(MagicIcon, "Sparkles");
export const Store = createPolarisIcon(StoreIcon, "Store");
export const Trash2 = createPolarisIcon(DeleteIcon, "Trash2");
export const TrendingDown = createPolarisIcon(ChartHistogramFlatIcon, "TrendingDown");
export const Truck = createPolarisIcon(DeliveryIcon, "Truck");
export const Wand2 = createPolarisIcon(WandIcon, "Wand2");
export const X = createPolarisIcon(XIcon, "X");

/** Pending-step outline — no close Polaris equivalent. */
export function Circle({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 shrink-0 rounded-full border border-current",
        className
      )}
      {...props}
    />
  );
}
Circle.displayName = "Circle";

/** Dashed pending outline for workflow steps. */
export function CircleDashed({
  className,
  ...props
}: ComponentProps<typeof BlankIcon>) {
  return (
    <BlankIcon
      className={cn("size-4 shrink-0", className)}
      fill="currentColor"
      aria-hidden
      {...props}
    />
  );
}
CircleDashed.displayName = "CircleDashed";

export { Spinner as Loader2 };
