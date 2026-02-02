import type { SxProps, Theme } from '@mui/material/styles'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'

type Command = {
  text: string
  color: string
}

type Props = {
  commands: Command[]
  sx?: SxProps<Theme>
}

export function CommandList({ commands, sx }: Props) {
  return (
    <List disablePadding sx={{ fontFamily: "'Roboto Mono'", fontSize: '18px', ...sx }}>
      {commands.map((cmd) => (
        <ListItem key={cmd.text} disablePadding sx={{ color: cmd.color, mb: '10px' }}>
          {cmd.text}
        </ListItem>
      ))}
    </List>
  )
}
