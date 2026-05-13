import { TaskForm } from '../../../../components/task-form'

export default function NewTaskPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground mb-6">New task</h1>
      <TaskForm />
    </div>
  )
}
