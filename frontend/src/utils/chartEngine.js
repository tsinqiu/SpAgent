import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GraphicComponent, GridComponent, LegendComponent, MarkAreaComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

use([
  BarChart, CanvasRenderer, GraphicComponent, GridComponent, LegendComponent, LineChart,
  MarkAreaComponent, PieChart, ScatterChart, TooltipComponent, VisualMapComponent,
])

export { init }
